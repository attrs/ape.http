var https = require('https');
var http = require('http');
var express = require('express');
var fs = require('fs');
var path = require('path');
var attrs = require('./attrs.express.js');

var buckets = {};
var buckets_versioning = {};
var app = express();
var root = express();
var logdir;
var httpd, httpsd;

var debug = false;


// class Bucket
function print_bound(bucket, uri, method) {
	console.log('[' + bucket.bundle.bundleId + '-' + bucket.bundle.version + '] ' + method + ' ' + uri);
}

var Bucket = function Bucket(bundle, name) {
	if( !name ) name = 'default';
	this.name = name;
	this.bundle = bundle;
	this.mounted = {};
	this.body = express();
	
	buckets[bundle.bundleId + ':' + name] = buckets_versioning[bundle.bundleId + '-' + bundle.version + ':' + name] = this;
};

Bucket.prototype = {
	mount: function(uri) {
		var name = this.name;
		var bundle = this.bundle;
		var router = express();
		
		if( typeof(uri) !== 'string' || !uri.startsWith('/') ) return console.error('[ape.http] illegal mount uri [' + uri + ']');
		
		var logfilename = bundle.bundleId + '_' + bundle.version + '_' + name;
		if( logdir ) {
			router.use(express.logger({
				stream: fs.createWriteStream(path.join(logdir, logfilename + '-access.log'), {flags: 'a'}),
				format: ':date - :method :status :url :remote-addr [HTTP/:http-version :res[content-length] :referrer :user-agent :response-time ms]'
			}));
		}
		
		router.use(function(req, res, next) {
			if( bundle ) 
				res.header('X-Plugin', bundle.bundleId + '-' + bundle.version);
			next();
		});
	
		router.use(this.body);

		if( logdir ) {
			router.use(attrs.errorlog({
				showMessage: false,
				dump: true,
				showStack: true,
				logErrors: path.join(logdir, logfilename + '-error.log') 
			}));
		}
		
		root.use(uri, router);
		this.mounted[uri] = this;
	},
	unmount: function(path) {
		var router = this.mounted[path];
		root.use(path, null);
	},
	mounts: function() {
		return this.mounted;
	},
	filter: function(fn) {
		return this.body.use(fn);
	},
	bucket: function(uri, bucket) {
		if( !(bucket instanceof Bucket) ) return console.error('invalid bucket', uri, bucket);
		return this.body.use(uri, bucket.body);
	},
	use: function(uri, fn) {
		if( typeof(uri) === 'function' ) return this.filter(uri);
		
		print_bound(this, uri, 'ALL');
		return this.body.use(uri, fn);
	},
	get: function(uri, fn) {
		print_bound(this, uri, 'GET');
		return this.body.get(uri, fn);
	},
	post: function(uri, fn) {
		print_bound(this, uri, 'POST');
		return this.body.post(uri, fn);
	},
	put: function(uri, fn) {
		print_bound(this, uri, 'PUT');
		return this.body.put(uri, fn);
	},
	del: function(uri, fn) {
		print_bound(this, uri, 'DELETE');
		return this.body.del(uri, fn);
	},
	options: function(uri, fn) {
		print_bound(this, uri, 'OPTIONS');
		return this.body.options(uri, fn);
	},
	static: function(uri, path) {
		if( fs.statSync(path).isFile() ) {
			return this.file(uri, path);
		} else {
			return this.dir(uri, path);
		}
	},
	dir: function(uri, path) {
		print_bound(this, uri, 'DIR');
		return this.body.use(uri, express.static(path));
	},
	file: function(uri, path) {
		print_bound(this, uri, 'FILE');
		var fn = (function(path) {
			return function(req, res, next) {
				if( fs.existsSync(path) ) return res.sendfile(path);
				next();
			}
		})(path);
		return this.body.use(uri, fn);
	},
	remove: function(method, uri) {
		print_bound(this, uri, method + '(remove)');
		var arg = this.body.routes[method];
		if( arg ) {
			for(var i=0; i < arg.length; i++) {
				var o = arg[i];
				if( o.path === uri ) delete arg[i];				
			}
		}
	},
	drop: function() {
		this.body.routes = {};
	}
};

module.exports = {
	start: function(ctx) {
		debug = this.options.debug;

		var exports = {
			create: function(bundle, name) {
				if( !bundle ) throw new Error('invalid_bundle');
				var bucket = new Bucket(bundle, name);
				return bucket;
			},
			bucket: function(bundleId, name, version) {
				if( !name ) name = 'default';
				var bucket;
				if( version ) bucket = buckets_versioning[bundleId + '-' + version + ':' + name];
				if( bucket ) return bucket; 
				return buckets[bundleId + ':' + name];
			},
			buckets: function() {
				return buckets;
			}
		};

		Object.defineProperty(exports, 'provider', {
			value: 'express'
		});

		Object.defineProperty(exports, 'engine', {
			get: function() {
				return app;
			}
		});
		
		Object.defineProperty(exports, 'httpd', {
			get: function() {
				return httpd;
			}
		});

		Object.defineProperty(exports, 'httpsd', {
			get: function() {
				return httpsd;
			}
		});

		this.exports = exports;

		var port = this.options.port;
		var ssl = this.options.ssl;
		var docbase = this.options.docbase;
		var debug = this.options.debug;
		
		logdir = this.workspace.path('logs');
		if( !fs.existsSync(logdir) ) fs.mkdirSync(logdir);

		if( typeof(port) !== 'number' && port <= 0 ) throw new Error('invalid port option:' + this.options);

		if( debug ) app.use(express.logger({format: ':date - \x1b[1m:method\x1b[0m \x1b[36m:status \x1b[33m:url\x1b[0m, :response-time ms'}));			
		app.use(express.logger({stream: fs.createWriteStream(path.join(logdir, 'access.log'), {flags: 'a'}), format: ':date - :method :status :url :remote-addr [HTTP/:http-version :res[content-length] :referrer :user-agent :response-time ms]' }));
		app.use(express.compress());
		app.use(express.favicon());
		app.use(attrs.charset('utf-8'));

		if( docbase ) app.use(express.static(docbase));

		var SESSION = {};
		app.use(express.bodyParser());
		app.use(express.methodOverride());
		app.use(attrs.cors());
		app.use(express.cookieParser('bf29b53c-0e77-4916-876e-19ed288e79ec'));
		app.use(function(req, res, next) {
			req.session = SESSION;
			var send = res.send;
			res.send = function(obj, status, msg) {				
				this.app.set('json spaces', '\t');
				if( obj === null || obj === undefined ) {
					return send.apply(res, [204]);
				}

				send.apply(res, arguments);
			}

			next();
		});
		app.use(attrs.poweredBy('Attributes, Express'));
		app.use(root);
		app.use(attrs.errorlog({ showMessage: false, showStack: true, logErrors: path.join(logdir, 'error.log') }));
		app.use(attrs.errorsend({ showStack: true }));

		httpd = http.createServer(app);
		httpd.on('error', function (e) {
			if (e.code == 'EADDRINUSE') {
				console.log('Address in use, retrying...');
				setTimeout(function () {
					httpd.close();
					httpd.listen(port);
				}, 1000);
			}
		});

		if( typeof(ssl) === 'object' ) {
			httpsd = https.createServer(ssl, app);

			httpsd.on('error', function (e) {
				console.error('https server error', e.message, e.code);
			});
			
			httpsd.listen((ssl.port || 443), function() {
				console.log('HTTP Server listening on port ' + (ssl.port || 443) + ', with [' + JSON.stringify(ssl) + ']');			
			});
		} else {		
			httpd.listen(port || 80, function() {
				console.log('HTTP Server listening on port ' + port + ', with [' + (docbase || 'none') + ']');			
			});
		}
	},
	stop: function(ctx) {
		if( httpd ) httpd.close();
		if( httpsd ) httpsd.close();
	}
};
