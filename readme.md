## ssh2-auth

A wrapper over [ssh2](https://github.com/mscdex/ssh2)'s client module to handle the authentication step.

### Installation

```
npm install ssh2-auth
```

### Usage

Simplest use case, just provide the hostname as a string, with user and port if they are not the default ones.
In this example we are relying on the default user's public keys for the authentication (`~/.ssh/id_dsa`, `~/.ssh/id_ecdsa`, `~/.ssh/id_rsa`).

```js
var ssh2auth = require('ssh2-auth');

ssh2auth('user@example.com:2222', function(err, conn) {
    if (err) return console.log(err);
    var command = 'echo hey there, im $(whoami) at $(hostname)';
    conn.exec(command, function(err, proc) {
        proc.stdout.pipe(process.stdout);
        proc.on('close', function() {
            conn.end();
        });
    });
});
```

Authentication with the provided password, for the current user and default port (port 22):

```js
ssh2auth({ host: 'example.com', password: 'secret' }, function(err, conn) {
    if (err) return console.log(err);
    var command = 'echo hey there, im $(whoami) at $(hostname)';
    conn.exec(command, function(err, proc) {
        proc.stdout.pipe(process.stdout);
        proc.on('close', function() {
            conn.end();
        });
    });
});
```

Public key authentication with the identity file in a custom location:

```js
ssh2auth({
    host: 'example.com',
    port: 'port',
    user: 'user',
    // can be an array of key paths instead, to try them until one of them succeeds
    privateKey: '/path/to/key.pem'
}, function(err, conn) {
    // ...
});
```

### License

MIT license - http://www.opensource.org/licenses/mit-license.php
