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



function docbase(config) {
	config = config || {};
	
	return function(req, res, next) {	
		var origindocbase = req.docbase;
		var docbase;
				
		if( typeof config.docbase === 'object' ) {
			docbase = config.docbase[req.hostname] || config.docbase['*'];
		} else if( typeof config.docbase === 'string' ) {
			docbase = config.docbase;
			if( req.vhost && ~base.indexOf(':') ) {
				docbase = docbase.split(':1').join(req.vhost[0])
				.split(':2').join(req.vhost[1])
				.split(':3').join(req.vhost[2])
				.split(':4').join(req.vhost[3])
				.split(':5').join(req.vhost[4]);
			}
		}
		
		var filterchain = [];
		for(var pattern in config.filters) {
			var filter = filters[pattern];
		
			if( minimatch(req.url, pattern) ) {
				if( filter === false ) filterchain.push(false);
				else if( typeof filter === 'function' ) filterchain.push(filter);
				else if( Array.isArray(filter) ) filterchain = filterchain.concat(filterchain, filter);
			}
		}
		
		if( config.debug ) util.debug(req.server, 'docbase(' + docbase + ')', req.url, filterchain);
		
		req.docbase = docbase;
		
		var index = 0;
		var dispatch = function() {
			var fn = filterchain[index++];
			if( fn ) {
				fn(req, res, function(err) {
					if( err ) return next(err);
					dispatch();
				});
			} else {
				if( docbase ) express.static(docbase)(req, res, next);
				else next();
			}
		};
		dispatch();
		
		req.docbase = origindocbase;
	};
}

function cors(options) {
	options = options || {};
	return function(req, res, next){
		if ('OPTIONS' == req.method) {
			var config = options[req.hostname];
			if( config ) {
				res.header('Access-Control-Allow-Origin', req.hostname);
				res.header('Access-Control-Allow-Methods', config.methods ? config.methods.join(',') : '*');
				res.header('Access-Control-Allow-Headers', config.headers ? config.headers.join(',') : '*');
				res.send();
			}
		}
		
		next();
	};
};

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
		for(var k in options.variables ) app.set(k, options.variables[k]);

		app.use(function(req, res, next) {
			var originserver = req.server;
			req.server = self;
			next();
			req.server = originserver;
		});
		app.use(routers.accesslog(options.logging));

		if( options.compression !== false ) {
			app.use(compression( (typeof options.compression === 'number' ? {threshold: options.compression} : options.compression || {}) ));
		}

		var forward = options.forward;
		if( forward ) {
			var forwardoptions = (typeof forward === 'object' ? forward : {forward:forward});
			app.use(function(req, res, next) {
				var request = http.request({
					url: Url.parse(forwardoptions.forward),
					headers: req.headers,
					method: req.method
				}, function(response) {
					response.pipe(res, {end:true});
				});
				req.pipe(request, {end:true});
			});
	 	} else {
			app.use(favicon(options.favicon || path.resolve(__dirname, '../favicon/favicon.ico')));
			app.use(cors(options.cors));
			app.use(cookieparser({ secret: 'tlzmflt' }));
			app.use(methodoverride());
			app.use(cookiesession(options.session || { secret: 'tlzmflt' }));
			app.use(bodyparser.json());
			app.use(bodyparser.urlencoded({ extended: true }));
			app.use(multer());
			app.use(csurf());

			app.use(docbase({
				get debug() {
					return self.debug;
				},
				get docbase() {
					return options.docbase;
				},
				get filters() {
					return self.filters();
				}
			}));
			app.use(this.body);

			for(var file in options.mount) {
				app.use(options.mount[file], docbase({
					get debug() {
						return self.debug;
					},
					get docbase() {
						return file;
					},
					get filters() {
						return self.filters();
					}
				}));
			}
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
	listen: function(callback) {
		var listener = this.listener = Listener.get(this.options.port);
		listener.join(this);
		if( !listener.isListen() ) listener.listen(callback);
		return this;
	},
	close: function() {
		if( this.listener ) this.listener.drop(this);
		return this;
	},
	toString: function() {
		return 'http:' + (this.name || '(noname)');
	}
};


// static
var servers = {};
var filters = {};

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
	if( typeof name !== 'string' || !name ) return util.error('Server', 'illegal filter name', name);
	
	if( options === false ) {
		delete filters[name];
		return this;
	}
	
	if( typeof options !== 'object' ) return util.error('Server', 'illegal filter options(object)', options);
	if( typeof options === 'function' ) options = {filter:options};
	if( typeof options.filter !== 'function' ) return util.error('Server', 'illegal options.filter(function)', options);
		
	filters[name] = options;
	return this;
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

// bundle filter
filter('nodejs', {
	pattern: ['**/*.njs', '**/*.node.js', '/nodejs/*.js', '/nodejs/**/*.js', '**/*.jade', '**/*.ejs', '**/*.swig', '**/*.haml'],
	filter: require('./filters/nodejs.js')
});

module.exports = {
	Server: Server,
	all: all,
	get: get,
	create: create,
	finds: finds,
	find: find,
	mount: mount,
	mountToAll: mountToAll,
	filters: filters,
	filter: filter
};
