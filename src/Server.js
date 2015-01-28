var Listener = require('./Listener.js');

var express = require('express');
var multer = require('multer');
var bodyparser = require('body-parser');
var favicon = require('serve-favicon');
var methodoverride = require('method-override');
var csurf = require('csurf');
var compression = require('compression');
var cookieparser = require('cookie-parser');
var cookiesession = require('cookie-session');
var morgan = require('morgan');
var vhost = require('vhost');
var httpProxy = require('http-proxy');

var colors = require('colors');
var fs = require('fs');
var path = require('path');
var uuid = require('uuid');
var https = require('https');
var http = require('http');
var fns = require('./fns.js');
var httpProxy = require('http-proxy');
var minimatch = require("minimatch");


// class Server
function Server(options) {
	if( options && typeof options !== 'object' ) return console.error('illegal argument', options);
	
	this.options = options = options || {};
	
	this.debug = options.debug;
	var cwd = this.options.basedir || process.cwd();
	var app = express();
	var body = express.Router();
	var self = this;
	
	// confirm docbase
	var docbase = function(req, res, next) {
		var base = options.docbase;
		if( typeof base === 'object' ) base = base[req.hostname] || base['*'];
		
		if( typeof base === 'string' ) {
			if( req.vhost && ~base.indexOf(':') ) {
				base = base.split(':1').join(req.vhost[0])
				.split(':2').join(req.vhost[1])
				.split(':3').join(req.vhost[2])
				.split(':4').join(req.vhost[3])
				.split(':5').join(req.vhost[4]);
			}
		
			req.docbase = path.resolve(cwd, base);
		}			
		next();
	};
	
	// filter middleware
	var filter = function(req, res, next) {
		var uri = req.uri;
		patterns.forEach(function(pattern) {
			if( uri.match(pattern.regexp) ) {
				return pattern.filter.apply(self, [req.docbase, req, res, next]);
			}				
		});
		next();
	};
	
	// set settings
	app.set('json spaces', '\t');
	for(var k in options.variables ) app.set(k, options.variables[k]);
	
	app.use(fns.logging(options.logging));
	
	var forward = options.forward;
	if( forward ) {
		var forwardoptions = (typeof forward === 'object' ? forward : {forward:forward});
		var proxy = httpProxy.createProxyServer(forwardoptions);
		app.use(function(req, res, next) {
			proxy.web(req, res, { target: forward });
			
			/*proxy.on('error', function (err, req, res) {
				next('Something went wrong. And we are reporting a custom error message.');
			});
			
			proxy.on('proxyRes', function (proxyRes, req, res) {
				if( proxyRes.statusCode === 404 ) next();
				else if( !~[200,204].indexOf(proxyRes.statusCode) ) next(proxyRes.statusCode);
				//console.log('RAW Response from the target', proxyRes.statusCode, JSON.stringify(proxyRes.headers, true, 2));
			});*/
		});
 	} else {
		app.use(docbase);
		app.use(filter);
		if( options.favicon ) app.use(favicon(options.favicon));
		if( options.compress ) app.use(compression( (typeof options.compress === 'number' ? {threshold: options.compress} : {}) ));
		app.use(fns.charset(options.charset || 'utf8'));
		app.use(methodoverride());
		app.use(cookiesession(options.session || { secret: 'tlzmflt' }));
		app.use(bodyparser.json());
		app.use(bodyparser.urlencoded({ extended: true }));
		app.use(multer());
		app.use(csurf());
	
		// docbase
		app.use(function(req, res, next) {
			if( req.docbase ) express.static(req.docbase)(req, res, next);
			else next();
		});
	
		// mount
		for(var file in options.mount) {
			var p = options.mount[file];
			app.use(p, express.static(path.resolve(cwd, file)));
		}
	
		// body router
		app.use(body);
	}
	
	// status page
	if( options.statuspage ) {
		app.use('/status.json', function(req, res, next) {
			res.send(options.status || {
				docbase: req.docbase,
				host: req.hostname,
				options: options,
				port: port,
				forward: forward
			});
		});
	}
	
	// error page
	if( options.errorpage ) {
		app.use(function(err, req, res, next) {
			err = JSON.parse(JSON.stringify({
				message: err.message || err,
				stack: err.stack || '',
				status: res.status
			}));
			
			var html = fs.readSync(path.resolve(options.errorpage[err.status] || options.errorpage));
			html = html.split('{message}').join(err.message)
					.split('{status}').join(err.status)
					.split('{stack}').join(err.stack)
					.split('{error}').join(JSON.stringify(err));
			res.send(html);
		});
		
		app.use(function(req, res, next) {
			var err = JSON.parse(JSON.stringify({
				message: 'Not Found',
				stack: '',
				status: res.status
			}));
			
			var html = fs.readSync(path.resolve(options.errorpage[err.status] || options.errorpage));
			html = html.split('{message}').join(err.message)
					.split('{status}').join(err.status)
					.split('{stack}').join(err.stack)
					.split('{error}').join(JSON.stringify(err));
			res.send(html);
		});
	}
	
	var uri = options.uri;
	if( uri ) {
		var _app = app;
		app = express();
		if( !Array.isArray(uri) ) uri = [uri];
		uri.forEach(function(path) {
			app.use(path, _app);
		});
	}
	
	var hosts = options.host;
	if( hosts ) {
		var _app = app;
		app = express();
		if( !Array.isArray(hosts) ) hosts = [hosts];
		hosts.forEach(function(host) {
			app.use(vhost(host, _app));				
		});
	}
	
	this.router = app;
	this.body = body;
	
	/*var test = express.Router();
	test.use(function a() {});
	test.get('/test', function b() {});
	test.all('/test', function c() {});	
	console.dir(test.stack);*/
};

Server.prototype = {
	matches: function(name) {
		var result = false;
		var mapping = this.options.mapping || [];
		if( typeof mapping === 'string' ) mapping = [mapping];
		if( !Array.isArray(mapping) ) return console.error('invalid mapping option', this.options.mapping);
		
		mapping.forEach(function(pattern) {
			result = minimatch(name, pattern);
		});
		return result;
	},
	mappings: function() {
		return this.options.mappings || [];
	},
	list: function() {
		var result = {};
		this.body.stack.forEach(function(stack) {
			result[stack.path] = stack.handle;
		});
		return result;
	},
	mount: function(uri, bucket) {
		if( typeof uri !== 'string' || uri.indexOf('/') !== 0 ) return console.error('invalid uri', uri);
		if( !bucket || !bucket.router ) return console.error('invalid bucket', bucket);
		if( this.debug ) console.log('[plexi.http/' + this.name  + '] mount "' + uri + '" from [' + bucket.name + ']');
		this.body.use(uri, bucket.router);
		return this;
	},
	unmount: function(bucket) {
		if( !bucket || !bucket.router ) return console.error('invalid bucket', bucket);
		this.body.stack.forEach(function(stack) {
			if( stack.handle === bucket.router ) {
				this.router.stack.splice(this.router.stack.indexOf(stack), 1);
			}
		});
		return this;
	},
	clear: function() {
		this.body.stack = [];
		return this;
	},
	listen: function(callback) {
		var listener = this.listener = Listener.get(this.options.port);
		listener.join(this);
		if( !listener.isListen() ) listener.listen(callback);
		return this;
	},
	close: function() {
		if( this.listener ) this.listener.drop(this);
		return this;
	}
};


// static
var servers = {};
var filters = {};
var patterns = [];

var get = function(name) {
	return servers[name];
};
var all = function() {
	var arr = [];
	for(var k in servers) {
		arr.push(servers[k]);
	}
	return arr;
};
var create = function(name, options) {
	if( typeof name === 'object' ) return new Server(name);
	var server = new Server(options);
	server.name = name;
	return servers[name] = server;
};
var finds = function(mapping) {
	var arr = [];
	for(var name in servers) {
		var server = servers[name];
		if( server && server.matches(mapping) ) {
			arr.push(server);
		}
	}
	return arr.length ? arr : null;
};
var find = function(mapping) {
	for(var name in servers) {
		var server = servers[name];
		if( server && server.matches(mapping) ) return server;
	}
	return null;
};
var filter = function(name, options) {
	if( typeof name !== 'string' || !name ) return console.error('illegal pattern', name);
	if( typeof options === 'function' ) options = {filter:options};
	filters[name] = options;
	return this;
};

module.exports = {
	Server: Server,
	all: all,
	get: get,
	create: create,
	finds: finds,
	find: find,
	filters: filters,
	filter: filter
};


// test
var testFilter = require('./filters/test.js');
filter('test', {
	pattern: ['*.test', '/test/*'],
	filter: testFilter
});