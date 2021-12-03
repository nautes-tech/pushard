const { spawn, exec } = require('child_process');

module.exports = {
  // for larger responses
  spawnShellCommand: ({ cmd, args, cwd }) =>
    new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
      child.on('close', (code) => (code ? reject(code) : resolve(code)));
    }),

  // for shorter responses
  execShellCommand: ({ cmd, args, cwd }) =>
    new Promise((resolve, reject) => {
      exec(`${cmd} ${args.join(' ')}`, { cwd }, (err, stdout) => {
        if (err) {
          reject(err);
        } else {
          resolve(stdout);
        }
      });
    }),
};
