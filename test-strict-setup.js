import { execSync } from 'child_process';
import fs from 'fs';

fs.writeFileSync('test-strict.js', `
"use strict";
foo();
`);

fs.writeFileSync('test-html.html', `
<script>window.foo = function() { console.log("foo"); }</script>
<script type="module" src="./test-strict.js"></script>
`);
