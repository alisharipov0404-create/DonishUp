import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import http from "http";
import multer from "multer";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";

import { Server } from "socket.io";
import { broker } from "./src/services/broker.js";
import { NotificationService } from "./src/services/NotificationService.js";
import { ChatService } from "./src/services/ChatService.js";
import webpush from "web-push";

const textbooksDir = path.join(process.cwd(), 'uploads', 'textbooks');
if (!fs.existsSync(textbooksDir)) {
  fs.mkdirSync(textbooksDir, { recursive: true });
}

const materialsDir = path.join(process.cwd(), 'uploads', 'materials');
if (!fs.existsSync(materialsDir)) {
  fs.mkdirSync(materialsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (req.path.includes('/api/materials')) {
      cb(null, materialsDir);
    } else {
      cb(null, textbooksDir);
    }
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '_'));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (req.path.includes('/api/materials')) {
      // Allow pdf, doc, docx, ppt, pptx, png, jpg, jpeg
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'image/png', 'image/jpeg', 'image/jpg'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type for materials'));
      }
    } else {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('Only PDF files are allowed'));
      }
    }
  }
});

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  
  const PORT = 3000;

  // Initialize DB
  let db: any;
  try {
    db = new Database('donishup.db');
    console.log("Database connected successfully");
    
    // Инициализируем микросервис уведомлений
    new NotificationService(io, db);
    // Инициализируем микросервис чата
    new ChatService(io);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        name TEXT,
        class_id TEXT,
        child_id TEXT,
        xp INTEGER DEFAULT 0,
        subjects TEXT
      );

      CREATE TABLE IF NOT EXISTS schedule (
        id TEXT PRIMARY KEY,
        class_id TEXT,
        dayOfWeek TEXT,
        time TEXT,
        subject TEXT,
        type TEXT,
        icon TEXT,
        teacher_id TEXT,
        room TEXT
      );

      CREATE TABLE IF NOT EXISTS grades (
        id TEXT PRIMARY KEY,
        student_id TEXT,
        type TEXT,
        subject TEXT,
        value INTEGER,
        date TEXT
      );

      CREATE TABLE IF NOT EXISTS homework (
        id TEXT PRIMARY KEY,
        teacher_id TEXT,
        class_id TEXT,
        user_id TEXT,
        subject TEXT,
        description TEXT,
        dueDate TEXT,
        status TEXT
      );

      CREATE TABLE IF NOT EXISTS quests (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        title TEXT,
        description TEXT,
        xp INTEGER,
        completed INTEGER DEFAULT 0,
        date TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT,
        senderName TEXT,
        role TEXT,
        text TEXT,
        timestamp INTEGER,
        class_id TEXT,
        image TEXT
      );

      CREATE TABLE IF NOT EXISTS notebooks (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        title TEXT,
        template TEXT,
        content TEXT
      );

      CREATE TABLE IF NOT EXISTS knowledge_graph (
        class_id TEXT PRIMARY KEY,
        data TEXT
      );

      CREATE TABLE IF NOT EXISTS subjects (
        id TEXT PRIMARY KEY,
        type TEXT UNIQUE,
        name TEXT
      );

      CREATE TABLE IF NOT EXISTS materials (
        id TEXT PRIMARY KEY,
        class_id TEXT,
        subject TEXT,
        teacher_id TEXT,
        title TEXT,
        content TEXT,
        file_url TEXT,
        file_type TEXT,
        date TEXT
      );

      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        subscription TEXT
      );
    `);

    try {
      db.prepare("ALTER TABLE users ADD COLUMN subjects TEXT").run();
    } catch (e) {}

    try {
      db.prepare("ALTER TABLE messages ADD COLUMN image TEXT").run();
    } catch (e) {
      // Column might already exist
    }

    try {
      db.prepare("ALTER TABLE quests ADD COLUMN date TEXT").run();
    } catch (e) {
      // Column might already exist
    }

    // Initial Subjects
    const subjectCount = db.prepare('SELECT COUNT(*) as count FROM subjects').get() as { count: number };
    if (subjectCount.count === 0) {
        console.log("Seeding subjects...");
        const insertSubject = db.prepare('INSERT INTO subjects (id, type, name) VALUES (?, ?, ?)');
        const defaultSubjects = [
            { type: 'tajik', name: 'Tajik Language' },
            { type: 'russian', name: 'Russian Language' },
            { type: 'english', name: 'English Language' },
            { type: 'math', name: 'Mathematics' },
            { type: 'physics', name: 'Physics' },
            { type: 'chemistry', name: 'Chemistry' },
            { type: 'biology', name: 'Biology' },
            { type: 'geography', name: 'Geography' },
            { type: 'history_tj', name: 'History of Tajikistan' },
            { type: 'history_world', name: 'World History' },
            { type: 'social_studies', name: 'Social Studies' },
            { type: 'informatics', name: 'Computer Science' },
            { type: 'labor', name: 'Labor Training' },
            { type: 'pe', name: 'Physical Education' },
            { type: 'art_music', name: 'Art and Music' }
        ];
        defaultSubjects.forEach(s => {
            insertSubject.run(s.type, s.type, s.name);
        });
    }

    // Insert default users if empty
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    if (userCount.count === 0) {
        console.log("Seeding users...");
        const insertUser = db.prepare('INSERT INTO users (id, username, password, role, name, class_id, child_id, xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        insertUser.run('u1', 'admin', '123', 'Admin', 'Системный Админ', null, null, 0);
        insertUser.run('u2', 'teacher1', '123', 'Teacher', 'Иван Петрович', '9-B', null, 1200);
        insertUser.run('u3', 'student1', '123', 'Student', 'Алиса Смирнова', '9-B', null, 2450);
        insertUser.run('u4', 'student2', '123', 'Student', 'Борис Иванов', '9-B', null, 1800);
        insertUser.run('u5', 'parent1', '123', 'Parent', 'Мама Алисы', '9-B', 'u3', 0);
        insertUser.run('u6', 'personal1', '123', 'Personal', 'Джон Доу', null, null, 500);
    }

    // Initial Schedule
    const scheduleCount = db.prepare('SELECT COUNT(*) as count FROM schedule').get() as { count: number };
    if (scheduleCount.count === 0) {
        console.log("Seeding schedule...");
        const insertSchedule = db.prepare('INSERT INTO schedule (id, class_id, dayOfWeek, time, subject, type, icon, teacher_id, room) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
        const times = ['08:00', '08:50', '09:40', '10:40', '11:30', '12:20', '13:30', '14:20'];
        const subjects = [
            { name: 'Math', type: 'math', icon: 'calculator' },
            { name: 'English', type: 'english', icon: 'languages' },
            { name: 'Biology', type: 'biology', icon: 'dna' },
            { name: 'History', type: 'history', icon: 'scroll' },
            { name: 'PE', type: 'pe', icon: 'activity' },
            { name: 'Art', type: 'art', icon: 'palette' },
            { name: 'Music', type: 'music', icon: 'music' },
            { name: 'Geography', type: 'geography', icon: 'globe' }
        ];
        const classes = ['9-B', '9-C', '10-B', '10-C', '11-B', '11-C'];
        classes.forEach(cls => {
            days.forEach(day => {
                times.forEach((time, index) => {
                    const subj = subjects[(index + classes.indexOf(cls)) % subjects.length];
                    insertSchedule.run(`sch_${cls}_${day}_${time}`, cls, day, time, subj.name, subj.type, subj.icon, 'u2', `10${1 + (index % 5)}`);
                });
            });
        });
    }

    // Initial Grades
    const gradesCount = db.prepare('SELECT COUNT(*) as count FROM grades').get() as { count: number };
    if (gradesCount.count === 0) {
        console.log("Seeding grades...");
        const insertGrade = db.prepare('INSERT INTO grades (id, student_id, type, subject, value, date) VALUES (?, ?, ?, ?, ?, ?)');
        const today = new Date();
        const subjects = [
            { name: 'Math', type: 'math', icon: 'calculator' },
            { name: 'English', type: 'english', icon: 'languages' },
            { name: 'Biology', type: 'biology', icon: 'dna' },
            { name: 'History', type: 'history', icon: 'scroll' },
            { name: 'PE', type: 'pe', icon: 'activity' },
            { name: 'Art', type: 'art', icon: 'palette' },
            { name: 'Music', type: 'music', icon: 'music' },
            { name: 'Geography', type: 'geography', icon: 'globe' }
        ];
        ['u3', 'u4'].forEach(studentId => {
            subjects.forEach(subject => {
                for(let i=0; i<5; i++) {
                    const d = new Date(today);
                    d.setDate(d.getDate() - Math.floor(Math.random() * 30));
                    let val = Math.floor(Math.random() * 3) + 3;
                    if (studentId === 'u3' && subject.type === 'math' && i > 2) val = 2; 
                    insertGrade.run(`grd_${studentId}_${subject.type}_${i}`, studentId, subject.type, subject.name, val, d.toISOString().split('T')[0]);
                }
            });
        });
    }

    // Initial Homework
    const homeworkCount = db.prepare('SELECT COUNT(*) as count FROM homework').get() as { count: number };
    if (homeworkCount.count === 0) {
        console.log("Seeding homework...");
        const insertHomework = db.prepare('INSERT INTO homework (id, teacher_id, class_id, user_id, subject, description, dueDate, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        insertHomework.run('hw_1', 'u2', '9-B', null, 'math', 'Решить уравнения на стр. 45', '2026-03-10', 'todo');
        insertHomework.run('hw_2', 'u2', '9-B', null, 'english', 'Эссе на тему "Мое лето"', '2026-03-12', 'inprogress');
        insertHomework.run('hw_3', 'u2', '9-B', null, 'history', 'Прочитать параграф 12', '2026-03-08', 'done');
    }
  } catch (err) {
    console.error("Database initialization failed:", err);
    db = new Database(':memory:');
    console.log("Using in-memory database fallback");
  }

  app.use(express.json({ limit: '10mb' }));
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Socket.io logic
  io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);

    socket.on("join-room", (room) => {
      socket.join(room);
      console.log(`Socket ${socket.id} joined room ${room}`);
    });

    socket.on("join-user", (user) => {
      if (!user || !user.id) return;
      socket.join(`user_${user.id}`);
      if (user.class_id) {
        socket.join(`class_${user.class_id}`);
      }
      if (user.school_id) {
        socket.join(`school_${user.school_id}`);
      }
      console.log(`Socket ${socket.id} joined user rooms for ${user.username}`);
    });

    socket.on("leave-room", (room) => {
      socket.leave(room);
      console.log(`Socket ${socket.id} left room ${room}`);
    });

    // Chat
    socket.on("send-message", (data) => {
      try {
        const id = 'msg_' + Date.now() + Math.random().toString(36).substr(2, 5);
        db.prepare('INSERT INTO messages (id, sender_id, senderName, role, text, timestamp, class_id, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, data.sender_id, data.senderName, data.role, data.text, data.timestamp, data.class_id, data.image || null);
        
        const room = data.class_id || 'general';
        
        // Микросервисный подход: отправляем событие в брокер сообщений
        broker.publish('chat.message.created', { room, message: { ...data, id } });
      } catch (e) {
        console.error("Error saving message:", e);
      }
    });

    socket.on("typing", (data) => {
      const room = data.class_id || 'general';
      socket.to(room).emit("user-typing", data);
    });

    // WebRTC Signaling
    socket.on("webrtc-offer", (data) => {
      socket.to(data.room).emit("webrtc-offer", data);
    });

    socket.on("webrtc-answer", (data) => {
      socket.to(data.room).emit("webrtc-answer", data);
    });

    socket.on("webrtc-ice-candidate", (data) => {
      socket.to(data.room).emit("webrtc-ice-candidate", data);
    });

    socket.on("participant-joined", (data) => {
      socket.to(data.room).emit("participant-joined", data);
    });

    socket.on("participant-left", (data) => {
      socket.to(data.room).emit("participant-left", data);
    });

    socket.on("whiteboard-draw", (data) => {
      const { room, drawData } = data;
      socket.to(room).emit("whiteboard-draw", drawData);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      // We might want to broadcast disconnect to all rooms this socket was in,
      // but Socket.io automatically leaves rooms on disconnect.
      // The clients will handle ICE connection state changes to detect drops.
    });
  });

  // API routes
  // Initialize VAPID keys for Web Push
  let vapidKeys;
  const vapidPath = path.join(process.cwd(), 'vapidKeys.json');
  if (fs.existsSync(vapidPath)) {
    vapidKeys = JSON.parse(fs.readFileSync(vapidPath, 'utf-8'));
  } else {
    vapidKeys = webpush.generateVAPIDKeys();
    fs.writeFileSync(vapidPath, JSON.stringify(vapidKeys));
  }
  webpush.setVapidDetails('mailto:admin@donishup.com', vapidKeys.publicKey, vapidKeys.privateKey);

  // Push API
  app.get("/api/push/public-key", (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  app.post("/api/push/subscribe", (req, res) => {
    const { user_id, subscription } = req.body;
    try {
      db.prepare('INSERT INTO push_subscriptions (user_id, subscription) VALUES (?, ?)').run(user_id, JSON.stringify(subscription));
      res.status(201).json({ success: true });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  app.post("/api/admin/upload", (req, res, next) => {
    upload.single('textbook')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  }, (req, res) => {
    const { user_id } = req.body;
    // Basic role check (ideally should be a middleware checking session)
    if (!user_id) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(user_id) as { role: string };
    if (!user || (user.role !== 'Admin' && user.role !== 'Teacher')) {
        return res.status(403).json({ success: false, message: "Forbidden: Only Admin or Teacher can upload" });
    }

    if (!req.file) {
        return res.status(400).json({ success: false, message: "No file uploaded or invalid file type" });
    }

    res.json({ 
        success: true, 
        message: "File uploaded successfully",
        file: {
            filename: req.file.filename,
            originalname: req.file.originalname,
            path: `/uploads/textbooks/${req.file.filename}`,
            size: req.file.size
        }
    });
  });

  app.get("/api/textbooks", (req, res) => {
    try {
        const files = fs.readdirSync(textbooksDir);
        const textbooks = files.map(file => {
            const stats = fs.statSync(path.join(textbooksDir, file));
            return {
                filename: file,
                originalname: file.substring(file.indexOf('-') + 1), // Extract original name
                path: `/uploads/textbooks/${file}`,
                size: stats.size,
                uploadDate: stats.birthtime
            };
        });
        res.json({ success: true, textbooks });
    } catch (e: any) {
        res.status(500).json({ success: false, message: "Failed to read textbooks directory" });
    }
  });

  // --- Materials API ---
  app.get("/api/materials", (req, res) => {
    const { class_id, subject } = req.query;
    let query = 'SELECT * FROM materials WHERE 1=1';
    const params: any[] = [];
    if (class_id) {
        query += ' AND class_id = ?';
        params.push(class_id);
    }
    if (subject) {
        query += ' AND subject = ?';
        params.push(subject);
    }
    query += ' ORDER BY date DESC';
    const materials = db.prepare(query).all(...params);
    res.json(materials);
  });

  app.post("/api/materials", upload.single('material_file'), (req, res) => {
    const { class_id, subject, teacher_id, title, content, date } = req.body;
    const id = 'mat_' + Date.now();
    let file_url = null;
    let file_type = null;

    if (req.file) {
        file_url = `/uploads/materials/${req.file.filename}`;
        file_type = req.file.mimetype;
    }

    try {
        db.prepare('INSERT INTO materials (id, class_id, subject, teacher_id, title, content, file_url, file_type, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
            id, class_id, subject, teacher_id, title, content || '', file_url, file_type, date
        );

        // Send a message to the class
        const msgId = 'msg_' + Date.now();
        const msgContent = `New material posted for ${subject}: ${title}`;
        
        // Get teacher info
        const teacher = db.prepare('SELECT name, role FROM users WHERE id = ?').get(teacher_id) as any;
        const senderName = teacher ? teacher.name : 'System';
        const role = teacher ? teacher.role : 'System';
        const timestamp = Date.now();

        db.prepare('INSERT INTO messages (id, sender_id, senderName, role, text, timestamp, class_id, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
            msgId, teacher_id, senderName, role, msgContent, timestamp, class_id, null
        );
        io.to(class_id).emit("new-message", {
            id: msgId,
            sender_id: teacher_id,
            senderName: senderName,
            role: role,
            text: msgContent,
            timestamp: timestamp,
            class_id: class_id,
            image: null
        });

        res.json({ success: true, id, file_url });
    } catch (e: any) {
        console.error("Failed to upload material", e);
        res.status(500).json({ success: false, message: e.message });
    }
  });

  app.delete("/api/materials/:id", (req, res) => {
    const id = req.params.id;
    try {
        const material = db.prepare('SELECT file_url FROM materials WHERE id = ?').get(id) as { file_url: string };
        if (material && material.file_url) {
            const filePath = path.join(process.cwd(), material.file_url);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        db.prepare('DELETE FROM materials WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
  });

  app.post("/api/dictionary", async (req, res) => {
    const { word, context, lang } = req.body;
    if (!word) return res.status(400).json({ success: false, message: "Word is required" });
    
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const prompt = `Define the word "${word}" in the context of "${context || ''}". Provide a short, easy to understand definition in ${lang === 'ru' ? 'Russian' : lang === 'tj' ? 'Tajik' : 'English'}. Keep it under 2 sentences.`;
        
        const result = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
        });
        
        res.json({ success: true, definition: result.text });
    } catch (e: any) {
        console.error("Dictionary error:", e);
        res.status(500).json({ success: false, message: e.message });
    }
  });

  // --- Quests API ---
  app.get('/api/quests', (req, res) => {
    try {
      const { user_id, date } = req.query;
      if (!user_id || !date) return res.status(400).json({ error: 'Missing user_id or date' });
      const quests = db.prepare('SELECT * FROM quests WHERE user_id = ? AND date = ?').all(user_id, date);
      res.json(quests);
    } catch (e: any) {
      console.error("Error getting quests:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/quests', (req, res) => {
    try {
      const { user_id, date, quests } = req.body;
      if (!user_id || !date || !Array.isArray(quests)) return res.status(400).json({ error: 'Invalid data' });
      
      const insert = db.prepare('INSERT INTO quests (id, user_id, title, description, xp, completed, date) VALUES (?, ?, ?, ?, ?, 0, ?)');
      const transaction = db.transaction((qs) => {
        for (const q of qs) {
          insert.run(user_id + '_' + Date.now() + Math.random(), user_id, q.title, q.description, q.xp, date);
        }
      });
      transaction(quests);
      res.json({ success: true });
    } catch (e: any) {
      console.error("Error saving quests:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/quests/complete', (req, res) => {
    try {
      const { quest_id, user_id } = req.body;
      if (!quest_id || !user_id) return res.status(400).json({ error: 'Missing data' });
      
      const quest = db.prepare('SELECT * FROM quests WHERE id = ? AND user_id = ?').get(quest_id, user_id) as any;
      if (!quest) return res.status(404).json({ error: 'Quest not found' });
      if (quest.completed) return res.status(400).json({ error: 'Quest already completed' });
      
      db.prepare('UPDATE quests SET completed = 1 WHERE id = ?').run(quest_id);
      db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(quest.xp, user_id);
      
      res.json({ success: true, xp_earned: quest.xp });
    } catch (e: any) {
      console.error("Error completing quest:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/login", (req, res) => {
    const { username, password, classId } = req.body;
    try {
        let user;
        if (classId && classId !== 'Admin') {
            user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ? AND class_id = ?').get(username, password, classId);
        } else if (classId === 'Admin') {
            user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ? AND role = ?').get(username, password, 'Admin');
        } else {
            user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
        }

        if (user) {
            res.json({ success: true, user });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (e: any) {
        console.error("Login error:", e);
        res.status(500).json({ success: false, message: e.message });
    }
  });

  app.get("/api/session", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/subjects", (req, res) => {
    try {
        const subjects = db.prepare('SELECT * FROM subjects').all();
        res.json(subjects);
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
  });

  app.post("/api/subjects", (req, res) => {
    try {
        const { type, name } = req.body;
        if (!type || !name) return res.status(400).json({ success: false, message: "Missing fields" });
        
        // Check if exists
        const existing = db.prepare('SELECT * FROM subjects WHERE type = ?').get(type);
        if (existing) {
            db.prepare('UPDATE subjects SET name = ? WHERE type = ?').run(name, type);
        } else {
            db.prepare('INSERT INTO subjects (id, type, name) VALUES (?, ?, ?)').run(type, type, name);
        }
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
  });

  app.delete("/api/subjects/:id", (req, res) => {
    try {
        db.prepare('DELETE FROM subjects WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
  });

  app.get("/api/users", (req, res) => {
    try {
      const users = db.prepare('SELECT * FROM users').all();
      const formattedUsers = users.map((u: any) => ({
          ...u,
          subjects: u.subjects ? JSON.parse(u.subjects) : []
      }));
      res.json(formattedUsers);
    } catch (e: any) {
      console.error("Error getting users:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/users", (req, res) => {
    const { username, password, role, name, class_id, subjects } = req.body;
    const id = 'u' + Date.now();
    try {
        const insertUser = db.prepare('INSERT INTO users (id, username, password, role, name, class_id, xp, subjects) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        const subjectsJson = subjects ? JSON.stringify(subjects) : null;
        insertUser.run(id, username, password, role, name, class_id, 0, subjectsJson);
        res.json({ success: true, user: { id, username, password, role, name, class_id, xp: 0, subjects } });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
  });

  app.put("/api/users/:id", (req, res) => {
    const { id } = req.params;
    const { username, password, role, name, class_id, subjects } = req.body;
    try {
        const subjectsJson = subjects ? JSON.stringify(subjects) : null;
        db.prepare('UPDATE users SET username = ?, password = ?, role = ?, name = ?, class_id = ?, subjects = ? WHERE id = ?')
          .run(username, password, role, name, class_id, subjectsJson, id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
  });

  app.delete("/api/users/:id", (req, res) => {
    const { id } = req.params;
    try {
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
  });

  // Schedule API
  app.get("/api/schedule", (req, res) => {
    try {
        const schedule = db.prepare('SELECT * FROM schedule').all();
        res.json(schedule);
    } catch (e: any) {
        console.error("Schedule API error:", e);
        res.status(500).json({ success: false, message: e.message });
    }
  });

  app.post("/api/schedule", (req, res) => {
    try {
        const { class_id, dayOfWeek, time, subject, type, icon, teacher_id, room } = req.body;
        if (!class_id || !dayOfWeek || !time || !subject || !teacher_id) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }
        
        const id = `sch_${class_id}_${dayOfWeek}_${time}`;
        
        // Remove existing entry for this slot if any
        db.prepare('DELETE FROM schedule WHERE class_id = ? AND dayOfWeek = ? AND time = ?').run(class_id, dayOfWeek, time);
        
        // Insert new entry
        db.prepare('INSERT INTO schedule (id, class_id, dayOfWeek, time, subject, type, icon, teacher_id, room) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, class_id, dayOfWeek, time, subject, type, icon || 'book', teacher_id, room || '101');
          
        broker.publish('schedule.updated', { class_id });
        res.json({ success: true, id });
    } catch (e: any) {
        console.error("Schedule POST error:", e);
        res.status(500).json({ success: false, message: e.message });
    }
  });

  app.delete("/api/schedule", (req, res) => {
    try {
        const { class_id, dayOfWeek, time } = req.body;
        if (!class_id || !dayOfWeek || !time) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }
        
        db.prepare('DELETE FROM schedule WHERE class_id = ? AND dayOfWeek = ? AND time = ?').run(class_id, dayOfWeek, time);
        broker.publish('schedule.updated', { class_id });
        res.json({ success: true });
    } catch (e: any) {
        console.error("Schedule DELETE error:", e);
        res.status(500).json({ success: false, message: e.message });
    }
  });

  // Grades API
  app.get("/api/grades", (req, res) => {
    try {
        const grades = db.prepare('SELECT * FROM grades').all();
        res.json(grades);
    } catch (e: any) {
        console.error("Grades API error:", e);
        res.status(500).json({ success: false, message: e.message });
    }
  });

  app.post("/api/grades", (req, res) => {
    const { student_id, type, subject, value, date } = req.body;
    const id = 'grd_' + Date.now();
    try {
        db.prepare('INSERT INTO grades (id, student_id, type, subject, value, date) VALUES (?, ?, ?, ?, ?, ?)').run(id, student_id, type, subject, value, date);
        const newGrade = { id, student_id, type, subject, value, date };
        
        // Микросервисный подход: отправляем событие в брокер сообщений
        broker.publish('grade.created', newGrade);
        
        res.json({ success: true, grade: newGrade });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
  });

  // Homework API
  app.get("/api/homework", (req, res) => {
    try {
        const homework = db.prepare('SELECT * FROM homework').all();
        res.json(homework);
    } catch (e: any) {
        console.error("Homework API error:", e);
        res.status(500).json({ success: false, message: e.message });
    }
  });

  app.post("/api/homework", (req, res) => {
    const { teacher_id, class_id, user_id, subject, description, dueDate, status } = req.body;
    const id = 'hw_' + Date.now();
    try {
        db.prepare('INSERT INTO homework (id, teacher_id, class_id, user_id, subject, description, dueDate, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
            id, teacher_id, class_id, user_id, subject, description, dueDate, status || 'todo'
        );
        const newHomework = { id, teacher_id, class_id, user_id, subject, description, dueDate, status: status || 'todo' };
        
        // Микросервисный подход: отправляем событие в брокер сообщений
        broker.publish('homework.created', newHomework);
        
        res.json({ success: true, homework: newHomework });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
  });

  app.put("/api/homework/:id", (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        db.prepare('UPDATE homework SET status = ? WHERE id = ?').run(status, id);
        broker.publish('homework.updated', { id, status });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
  });

  app.delete("/api/homework/:id", (req, res) => {
    const { id } = req.params;
    try {
        db.prepare('DELETE FROM homework WHERE id = ?').run(id);
        broker.publish('homework.deleted', { id, deleted: true });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
  });

  // Notebooks API
  app.get("/api/notebooks", (req, res) => {
    const { user_id } = req.query;
    try {
        const notebooks = db.prepare('SELECT * FROM notebooks WHERE user_id = ?').all(user_id);
        res.json({ success: true, notebooks });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
  });

  app.post("/api/notebooks", (req, res) => {
    const { user_id, title, template, content } = req.body;
    const id = 'nb_' + Date.now();
    try {
        db.prepare('INSERT INTO notebooks (id, user_id, title, template, content) VALUES (?, ?, ?, ?, ?)')
          .run(id, user_id, title, template, content);
        res.json({ success: true, id });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
  });

  app.put("/api/notebooks/:id", (req, res) => {
    const { title, template, content } = req.body;
    try {
        db.prepare('UPDATE notebooks SET title = ?, template = ?, content = ? WHERE id = ?')
          .run(title, template, content, req.params.id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
  });

  // Knowledge Graph API
  app.get("/api/knowledge_graph", (req, res) => {
    const { class_id } = req.query;
    try {
        const row = db.prepare('SELECT data FROM knowledge_graph WHERE class_id = ?').get(class_id) as { data: string };
        const data = row ? JSON.parse(row.data) : null;
        res.json({ success: true, data });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
  });

  app.post("/api/knowledge_graph", (req, res) => {
    const { class_id, data } = req.body;
    try {
        db.prepare('INSERT OR REPLACE INTO knowledge_graph (class_id, data) VALUES (?, ?)')
          .run(class_id, JSON.stringify(data));
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
  });

  app.get("/api/chat/messages", (req, res) => {
    const { class_id } = req.query;
    try {
      let messages;
      if (class_id) {
        messages = db.prepare('SELECT * FROM messages WHERE class_id = ? ORDER BY timestamp ASC').all(class_id);
      } else {
        messages = db.prepare('SELECT * FROM messages WHERE class_id IS NULL ORDER BY timestamp ASC').all();
      }
      res.json({ success: true, messages });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // Vite middleware for development or if dist is missing
  if (process.env.NODE_ENV !== "production" || !fs.existsSync(path.join(process.cwd(), "dist"))) {
    console.log("Starting Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    // Fallback for SPA
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api') || url.startsWith('/socket.io')) {
        return next();
      }
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        // Inject Gemini API Key
        template = template.replace('__GEMINI_API_KEY_PLACEHOLDER__', process.env.GEMINI_API_KEY || '');
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        console.error("Vite transform error:", e);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
}

startServer().catch(err => {
  console.error("CRITICAL: Failed to start server:", err);
});
