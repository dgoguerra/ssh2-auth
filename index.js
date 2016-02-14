var fs = require('fs'),
    path = require('path'),
    _ = require('lodash'),
    ssh2debug = require('debug')('ssh2'),
    authdebug = require('debug')('auth'),
    Client = require('ssh2').Client;

// parse host information (host, user and port) from
// a host string with format [user@]host[:port]
function parseHost(string) {
    var obj = {};
    
    var arr = string.split('@');

    if (arr.length === 2) {
        obj.user = arr[0];
        string = arr[1];
    } else {
        string = arr[0];
    }

    arr = string.split(':');
    obj.host = arr[0];

    if (arr.length === 2) {
        obj.port = arr[1];
    }

    return obj;
}

function authClient(connOpts, next) {
	var conn = new Client();

	conn.once('ready', function() {
		next(null, conn);
	});

	conn.once('error', function(err) {
		authdebug(('ssh2: '+err.message) || err);
		next(err);
	});

	conn.connect(connOpts);
}

function authWithPassword(connOpts, password, next) {
	authdebug('connecting to %s using password ...',
        connOpts.username+'@'+connOpts.hostname+':'+connOpts.port
    );

	connOpts.password = password;

	authClient(connOpts, next);
}

function authWithPublicKey(connOpts, keyFile, next) {
	// change to absolute path
	if (keyFile.substring(0, 2) === '~/') {
		keyFile = path.join(process.env.HOME, keyFile.substring('~/'.length));
	}

	if (keyFile.substring(0, 1) !== '/') {
		keyFile = path.join(process.cwd(), keyFile);
	}

	authdebug('connecting to %s using public key \'%s\'...',
        connOpts.username+'@'+connOpts.hostname+':'+connOpts.port,
        keyFile
    );

	// dont bother reading the file asynchronously, we'll wait until
	// this authentication fails to try the next one. No need to check
	// if the file exists either, an error will be thrown if it doesn't.
	try {
		connOpts.privateKey = fs.readFileSync(keyFile);
	} catch (e) {
		var err = new Error('file \''+keyFile+'\' doesn\'t exist');
		err.level = 'ssh2-auth';

		authdebug(err.message || err);
		return next(err);
	}

	authClient(connOpts, next);
}

module.exports = function(opts, next) {
	var dflOptions = {
		password: null,
		privateKey: null,
		tryDefaultPrivateKeys: true
	};

	var dflPrivateKeys = [
	    '~/.ssh/id_dsa',
	    '~/.ssh/id_ecdsa',
	    '~/.ssh/id_rsa'
	];

	// if the opts  object is just a string, assume its the host
	// field.
	if (_.isString(opts)) opts = { host: opts };

	opts = _.extend({}, dflOptions, opts);

	var authAttempts = [];

	// a password was provided, try password authentication first
	if (opts.password) {
		authAttempts.push({ type: 'password', password: opts.password });
	}

	// public key authentication; try to connect using a private key
	// supplied by the user, or one in the default paths.
	var identKeys = [];

	// the user-supplied keys are tried first
	if (opts.privateKey) {
		typeof opts.privateKey === 'string' && (opts.privateKey = [opts.privateKey]);
		identKeys = identKeys.concat(opts.privateKey);
	}

	// by default, also try the default public keys paths if the given credentials
	// fail (or no password / identity file were given), to keep the same behaviour
	// as the OpenSSH SSH client binary. Disable this with tryDefaultPrivateKeys = false.
	if (opts.tryDefaultPrivateKeys === true) {
		identKeys = identKeys.concat(dflPrivateKeys);
	}

	identKeys.forEach(function(keyFile) {
		authAttempts.push({ type: 'publickey', keyFile: keyFile });
	});

	// try to extract user and port from the host string. Explicit user-defined
	// fields will have priority over it.

	var hostObj = parseHost(opts.host || opts.hostname);

	var dflConnOpts = {
		host: hostObj.host || 'localhost',
		port: opts.port || hostObj.port || 22,
		user: opts.user || opts.username || hostObj.user || process.env.USER,
		debug: function(msg) {
			ssh2debug.enabled && ssh2debug(msg);
		}
	};

	function tryNextAuth() {
		if (!authAttempts.length) {
			var err = new Error('all configured authentication methods failed');
			err.level = 'ssh2-auth';

			authdebug(err.message || err);
			return next(err);
		}

		var auth = authAttempts.shift();

		switch (auth.type) {
			case 'password':
				authWithPassword(dflConnOpts, auth.password, function(err, conn) {
					if (err) return tryNextAuth();
					next(null, conn);
				});
				break;

			case 'publickey':
				authWithPublicKey(dflConnOpts, auth.keyFile, function(err, conn) {
					if (err) return tryNextAuth();
					next(null, conn);
				});
				break;
		}
	}

	tryNextAuth();
};
