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
	console.log('[' + bucket.plugin.pluginId + '-' + bucket.plugin.version + '] ' + method + ' ' + uri);
}

var Bucket = function Bucket(plugin, name) {
	if( !name ) name = 'default';
	if( !plugin ) throw new Error('illegal argument:plugin');
	if( typeof(name) !== 'string' ) throw new Error('illegal argument:name:' + name);
	
	this.name = name;
	this.plugin = plugin;
	this.mounted = {};
	this.body = express();
	
	buckets[plugin.pluginId + ':' + name] = buckets_versioning[plugin.pluginId + '@' + plugin.version + ':' + name] = this;
};

Bucket.prototype = {
	mount: function(uri) {
		var name = this.name;
		
		if( !uri ) {
			uri = '/' + this.plugin.pluginId;
			if( name !== 'default' ) uri = '/' + name;
		}
		
		if( typeof(uri) !== 'string' || !uri.startsWith('/') ) return console.error('[ape.http] illegal mount uri [' + uri + ']');
		
		var plugin = this.plugin;
		var router = express();
		
		var logfilename = plugin.pluginId + '@' + plugin.version + '-' + name;
		if( logdir ) {
			router.use(express.logger({
				stream: fs.createWriteStream(path.join(logdir, logfilename + '-access.log'), {flags: 'a'}),
				format: ':date - :method :status :url :remote-addr [HTTP/:http-version :res[content-length] :referrer :user-agent :response-time ms]'
			}));
		}
		
		router.use(function(req, res, next) {
			if( plugin ) 
				res.header('X-Plugin', plugin.pluginId + '@' + plugin.version);
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
		
		return this;
	},
	unmount: function(path) {
		var router = this.mounted[path];
		root.use(path, null);
		
		return this;
	},
	mounts: function() {
		return this.mounted;
	},
	filter: function(fn) {
		return this.body.use(fn);
	},
	bucket: function(uri, bucket) {
		if( !(bucket instanceof Bucket) ) return console.error('invalid bucket', uri, bucket);
		this.body.use(uri, bucket.body);
		return this;
	},
	use: function(uri, fn) {
		if( typeof(uri) === 'function' ) return this.filter(uri);
		
		print_bound(this, uri, 'ALL');
		this.body.use(uri, fn);
		return this;
	},
	get: function(uri, fn) {
		print_bound(this, uri, 'GET');
		this.body.get(uri, fn);
		return this;
	},
	post: function(uri, fn) {
		print_bound(this, uri, 'POST');
		this.body.post(uri, fn);
		return this;
	},
	put: function(uri, fn) {
		print_bound(this, uri, 'PUT');
		this.body.put(uri, fn);
		return this;
	},
	del: function(uri, fn) {
		print_bound(this, uri, 'DELETE');
		this.body.del(uri, fn);
		return this;
	},
	options: function(uri, fn) {
		print_bound(this, uri, 'OPTIONS');
		this.body.options(uri, fn);
		return this;
	},
	static: function(uri, path) {
		if( fs.statSync(path).isFile() ) {
			this.file(uri, path);
		} else {
			this.dir(uri, path);
		}
		return this;
	},
	dir: function(uri, path) {
		print_bound(this, uri, 'DIR');
		this.body.use(uri, express.static(path));
		return this;
	},
	file: function(uri, path) {
		print_bound(this, uri, 'FILE');
		var fn = (function(path) {
			return function(req, res, next) {
				if( fs.existsSync(path) ) return res.sendfile(path);
				next();
			}
		})(path);
		this.body.use(uri, fn);
		return this;
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
		return this;
	},
	drop: function() {
		this.body.routes = {};
		return this;
	}
};

module.exports = {
	start: function(ctx) {
		debug = this.options.debug;

		var exports = {
			create: function(plugin, name) {
				if( !plugin ) throw new Error('invalid_plugin');
				var bucket = new Bucket(plugin, name);
				return bucket;
			},
			bucket: function(pluginId, name, version) {
				if( !name ) name = 'default';
				var bucket;
				if( version ) bucket = buckets_versioning[pluginId + '@' + version + ':' + name];
				if( bucket ) return bucket; 
				return buckets[pluginId + ':' + name];
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

		var port = this.options.port || 8080;
		var ssl = this.options.ssl;
		var docbase = this.options.docbase || path.join(ctx.application.HOME, 'webapps');
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
