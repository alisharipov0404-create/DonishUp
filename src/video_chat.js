import { socket } from './app.js';

export class VideoChatManager {
    constructor(currentUserId) {
        this.currentUserId = currentUserId;
        this.localStream = null;
        this.peers = {}; // Map of userId -> RTCPeerConnection
        this.currentRoom = null;
        this.iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        socket.on('connect', () => {
            if (this.currentRoom) {
                socket.emit('join-room', this.currentRoom);
                socket.emit('participant-joined', { room: this.currentRoom, userId: this.currentUserId });
            }
        });

        socket.on('webrtc-offer', async (data) => {
            if (data.targetId === this.currentUserId) {
                console.log('Received call offer from:', data.callerId);
                await this.handleIncomingCall(data);
            }
        });

        socket.on('webrtc-answer', async (data) => {
            if (data.targetId === this.currentUserId) {
                console.log('Received answer from:', data.callerId);
                const peerConnection = this.peers[data.callerId];
                if (peerConnection && !peerConnection.currentRemoteDescription) {
                    const rtcSessionDescription = new RTCSessionDescription(data.answer);
                    await peerConnection.setRemoteDescription(rtcSessionDescription);
                }
            }
        });

        socket.on('webrtc-ice-candidate', async (data) => {
            if (data.targetId === this.currentUserId) {
                const peerConnection = this.peers[data.callerId];
                if (peerConnection) {
                    const candidate = new RTCIceCandidate(data.candidate);
                    await peerConnection.addIceCandidate(candidate);
                }
            }
        });

        // Simple participant join logic
        socket.on('participant-joined', async (data) => {
            if (data.userId !== this.currentUserId && data.room === this.currentRoom) {
                console.log('New participant joined:', data.userId);
                if (this.currentUserId < data.userId) {
                    await this.initiateCall(data.userId);
                }
            }
        });

        socket.on('participant-left', (data) => {
            if (data.room === this.currentRoom) {
                this.removePeer(data.userId);
            }
        });
    }

    async startLocalStream(videoElementId) {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (error) {
            console.warn('Error accessing video+audio, trying audio only...', error);
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            } catch (fallbackError) {
                console.warn('Error accessing audio, joining without media...', fallbackError);
                this.localStream = null; // Join without media
            }
        }
        
        if (this.localStream) {
            const localVideo = document.getElementById(videoElementId);
            if (localVideo) {
                localVideo.srcObject = this.localStream;
                localVideo.muted = true;
            }
        }
        return true; // Always return true to allow joining the room even without media
    }

    stopLocalStream() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
            const localVideo = document.getElementById('local-video');
            if (localVideo) localVideo.srcObject = null;
        }
    }

    toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                return audioTrack.enabled;
            }
        }
        return false;
    }

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                return videoTrack.enabled;
            }
        }
        return false;
    }

    async joinRoom(roomId) {
        this.currentRoom = roomId;
        console.log(`Joining video room: ${roomId}`);
        
        socket.emit('join-room', roomId);
        socket.emit('participant-joined', { room: roomId, userId: this.currentUserId });
    }

    async initiateCall(targetUserId) {
        console.log(`Initiating call to ${targetUserId}`);
        const peerConnection = new RTCPeerConnection(this.iceServers);
        this.peers[targetUserId] = peerConnection;

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => peerConnection.addTrack(track, this.localStream));
        }

        peerConnection.ontrack = (event) => {
            this.addRemoteVideo(targetUserId, event.streams[0]);
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('webrtc-ice-candidate', {
                    room: this.currentRoom,
                    callerId: this.currentUserId,
                    targetId: targetUserId,
                    candidate: event.candidate.toJSON()
                });
            }
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.emit('webrtc-offer', {
            room: this.currentRoom,
            callerId: this.currentUserId,
            targetId: targetUserId,
            offer: { type: offer.type, sdp: offer.sdp }
        });
    }

    async handleIncomingCall(callData) {
        const callerId = callData.callerId;
        console.log(`Handling incoming call from ${callerId}`);
        
        const peerConnection = new RTCPeerConnection(this.iceServers);
        this.peers[callerId] = peerConnection;

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => peerConnection.addTrack(track, this.localStream));
        }

        peerConnection.ontrack = (event) => {
            this.addRemoteVideo(callerId, event.streams[0]);
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('webrtc-ice-candidate', {
                    room: this.currentRoom,
                    callerId: this.currentUserId,
                    targetId: callerId,
                    candidate: event.candidate.toJSON()
                });
            }
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(callData.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit('webrtc-answer', {
            room: this.currentRoom,
            callerId: this.currentUserId,
            targetId: callerId,
            answer: { type: answer.type, sdp: answer.sdp }
        });
    }

    addRemoteVideo(userId, stream) {
        const grid = document.getElementById('vc-video-grid');
        if (!grid) return;

        let videoContainer = document.getElementById(`video-container-${userId}`);
        if (!videoContainer) {
            videoContainer = document.createElement('div');
            videoContainer.id = `video-container-${userId}`;
            videoContainer.className = 'relative bg-gray-800 rounded-xl overflow-hidden shadow-lg aspect-video flex items-center justify-center';
            
            const video = document.createElement('video');
            video.id = `video-${userId}`;
            video.autoplay = true;
            video.playsInline = true;
            video.className = 'w-full h-full object-cover';
            
            const label = document.createElement('div');
            label.className = 'absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm';
            label.textContent = `Участник ${userId.substring(0, 4)}`;

            videoContainer.appendChild(video);
            videoContainer.appendChild(label);
            grid.appendChild(videoContainer);
        }

        const videoEl = document.getElementById(`video-${userId}`);
        if (videoEl && videoEl.srcObject !== stream) {
            videoEl.srcObject = stream;
        }
    }

    async leaveRoom() {
        if (this.currentRoom) {
            socket.emit('participant-left', { room: this.currentRoom, userId: this.currentUserId });
            socket.emit('leave-room', this.currentRoom);
            this.currentRoom = null;
        }
        
        Object.keys(this.peers).forEach(userId => this.removePeer(userId));
        this.stopLocalStream();
    }

    removePeer(userId) {
        if (this.peers[userId]) {
            this.peers[userId].close();
            delete this.peers[userId];
        }
        const videoContainer = document.getElementById(`video-container-${userId}`);
        if (videoContainer) videoContainer.remove();
    }
}
