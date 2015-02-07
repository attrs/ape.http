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

var colors = require('colors');
var fs = require('fs');
var path = require('path');
var uuid = require('uuid');
var https = require('https');
var http = require('http');
var Url = require('url');
var minimatch = require("minimatch");

var routers = require('./routers.js');
var Listener = require('./Listener.js');
var util = require('./util.js');
var accesslog = routers.accesslog;
var errorlog = routers.errorlog;
var docbase = routers.docbase;
var forward = routers.forward;
var cors = routers.cors;


// class Server
function Server(options) {
	if( options && typeof options !== 'object' ) return util.error('illegal argument', options);
	
	this.options = options = options || {};	
	this.debug = options.debug || true;
	this.body = express.Router();
	this.build();
};

Server.prototype = {
	build: function() {
		var options = this.options;
		var app = express();
		var self = this;

		// set settings
		app.set('json spaces', '\t');
		app.set('server', this);
		for(var k in options.variables ) app.set(k, options.variables[k]);

		app.use(accesslog(options.logging));

		if( options.compression !== false ) {
			app.use(compression( (typeof options.compression === 'number' ? {threshold: options.compression} : options.compression || {}) ));
		}
		
		app.use(favicon(options.favicon || path.resolve(__dirname, '../favicon/favicon.ico')));
		app.use(forward(options.forward));
		app.use(cors(options.cors));
		app.use(cookieparser({ secret: 'tlzmflt' }));
		app.use(methodoverride());
		app.use(cookiesession(options.session || { secret: 'tlzmflt' }));
		app.use(bodyparser.json());
		app.use(bodyparser.urlencoded({ extended: true }));
		app.use(multer());
		//app.use(csurf());

		app.use(docbase({
			get label() {
				return self;
			},
			get debug() {
				return self.debug;
			},
			get docbase() {
				return options.docbase;
			},
			get filters() {
				return util.mix(filtermapping, self.filters());
			}
		}));
		app.use(this.body);

		for(var file in options.mount) {
			app.use(options.mount[file], docbase({
				get label() {
					return this.toString() + ':mount';
				}, 
				get debug() {
					return self.debug;
				},
				get docbase() {
					return file;
				},
				get filters() {
					return util.mix(filtermapping, self.filters());
				}
			}));
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
		
		return this;
	},
	
	// handle options
	filters: function(filters) {
		if( !arguments.length ) return this.options.filters;
		if( typeof filters !== 'object' ) return util.warn('invalid filters', filters);
		
		this.options.filters = {};
		for(var k in filters) this.filter(k, filters[k]);
		
		return this;
	},
	filter: function(pattern, fn) {
		if( arguments.length === 1 ) return this.options.filters && this.options.filters[pattern];
		
		if( typeof pattern !== 'string' ) return util.warn('illegal filter pattern', pattern);
		if( typeof fn !== 'function' ) return util.warn('illegal filter fn', fn);
		
		this.options.filters = this.options.filters || {};
		this.options.filters[pattern] = fn;
		
		return this;
	},
	mappings: function() {
		return this.options.mapping || [];
	},
	
	// methods
	matches: function(name) {
		var mapping = this.options.mapping || [];
		if( typeof mapping === 'string' ) mapping = [mapping];
		if( !Array.isArray(mapping) ) return util.error(this, 'invalid mapping option', this.options.mapping);
				
		var result = false;
		mapping.forEach(function(pattern) {
			result = minimatch(name, pattern);
		});
		return result;
	},
	list: function() {
		var result = {};
		this.body.stack.forEach(function(stack) {
			result[stack.path] = stack.handle;
		});
		return result;
	},
	mount: function(uri, router) {
		if( typeof uri !== 'string' || uri.indexOf('/') !== 0 ) return util.error(this, 'invalid uri', uri);
		
		if( typeof router === 'string' ) router = express.static(router);
		if( typeof router !== 'function' ) return util.error(this, 'invalid router', router);		
		this.body.use(uri, router);
		return this;
	},
	unmount: function(router) {
		if( typeof router !== 'function' ) return util.error(this, 'invalid router', router);
		var stack = this.body.stack;
		stack.forEach(function(stack) {
			if( stack.handle === router ) {
				stack.splice(stack.indexOf(stack), 1);
			}
		});
		return this;
	},
	listen: function(port) {
		port = port || this.options.port || 9000;
				
		var listener = Listener.get(port) || Listener.create(port);
		var listeners = this.listeners = this.listeners || [];

		if( !listener.has(this) ) listener.join(this);
		if( !~listeners.indexOf(listener) ) listeners.push(listener);		
		if( !listener.isListen() ) listener.listen();
		
		util.readonly(this, 'listeners');
		
		return this;
	},
	close: function(port) {
		var self = this;
		(this.listeners || []).forEach(function(listener) {
			listener.drop(self);
		});
		return this;
	},
	toString: function() {
		return 'server:' + (this.name || '(unnamed)');
	}
};


// static
var servers = {};
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
var mount = function(name, uri, router) {
	if( arguments.length === 2 ) {
		uri = name;
		router = uri;
		name = router.id;
	}
	
	if( typeof name !== 'string' ) return util.error('Server', 'invalid name', name);
	if( typeof uri !== 'string' || uri.indexOf('/') !== 0 ) return util.error('Server', 'invalid uri', uri);
	if( typeof router !== 'function' ) return util.error('Server', 'invalid router', router);
	
	var svrs = servers[name] || finds(name);
	if( !svrs ) return util.error('Server', 'cannot found matched server', name);
	
	svrs.forEach(function(server) {
		server.mount(uri, router);
	});
	return this;
};
var mountToAll = function(uri, router) {
	if( typeof uri !== 'string' ) return util.error('Server', 'invalid uri', uri);
	if( typeof router !== 'function' ) return util.error('Server', 'invalid router', router);
	
	var svrs = all();
	if( svrs ) {
		svrs.forEach(function(server) {
			server.mount(uri, router);
		});
	}
	return this;
};

// global filter
var filtermapping = {}, filters = {};
var filter = function(name, options) {
	if( !name || typeof name !== 'string' ) return util.error('Server', 'illegal filter name', name);
	if( filters[name] ) return util.error('Server', 'illegal ');
		
	if( options === false ) {
		delete filtermap[name];
	} else {
		if( typeof options !== 'object' ) return util.error('Server', 'illegal filter options(object)', options);
		if( typeof options === 'function' ) options = {filter:options};
		if( typeof options.filter !== 'function' ) return util.error('Server', 'illegal options.filter(function)', options);
		
		filters[name] = options;
	}
	
	filtermapping = {};
	for( var k in filters ) {
		var filter = filters[k];
		( filter.pattern || []).forEach(function(pattern) {
			if( typeof pattern !== 'string' ) return warn('Server', 'invalid filter pattern', k, pattern);
			
			if( !filtermapping[pattern] ) filtermapping[pattern] = [];
			filtermapping[pattern].push(filter.filter);
		});
	}
	
	return this;
};

// bundle filter
filter('nodejs', {
	pattern: ['**/*.njs', '**/*.node.js', '/nodejs/*.js', '/nodejs/**/*.js', '**/*.jade', '**/*.ejs', '**/*.swig', '**/*.haml'],
	filter: require('./filters/nodejs.js')
});

module.exports = {
	all: all,
	get: get,
	create: create,
	finds: finds,
	find: find,
	mount: mount,
	mountToAll: mountToAll,
	get filters() {
		return filters;
	},
	get filtermapping() {
		return filtermapping;
	},
	filter: filter
};
