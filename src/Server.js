var express = require('express');
var multer = require('multer');
var bodyparser = require('body-parser');
var favicon = require('serve-favicon');
var methodoverride = require('method-override');
var csurf = require('csurf');
var compression = require('compression');
var cookieparser = require('cookie-parser');
var cookiesession = require('cookie-session');
var vhost = require('vhost');

var colors = require('colors');
var fs = require('fs');
var path = require('path');
var uuid = require('uuid');
var https = require('https');
var http = require('http');
var fns = require('./fns.js');

//console.log('stack', app.stack);
//console.log('routes', app.routes);

// class Cors
function Cors(server, options) {
	var app = this.router = express();
	this.options = options = options || {};
	app.use(fns.cors(options));
}
Cors.prototype = {
	accept: function(uri, methods, headers) {
	},
	get: function(uri) {
		return {
			origins: ['*'],
			methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
			headers: ['Content-Type', 'Authorization', 'Content-Length', 'X-Requested-With']
		}
	}
};

// class VHost
function VHost(vhosts, options) {	
	this.vhosts = vhosts;
	this.router = express();
	this.reset(options);
}
VHost.prototype = {
	reset: function(options) {
		var options = this.options = options || this.options || {};
		
		if( !options.host || typeof(options.host) !== 'string' ) throw new Error('illegal host value in vhost:' + option.host);
		
		var basedir = this.vhosts.server.basedir;
		var bucbketbody = express();		
		var router = this.router;
		
		router.use(fns.docbase(basedir, options.docbase));
		router.use(bucbketbody);

		/* TODO: add cors access control feature
			var cors = new Cors(this, options.cors);
			this.cors = cors;
			app.use(cors.router);
		*/
		
		this.host = options.host;
		this.bucbketbody = bucbketbody;
		
		return this;
	},
	docbase: function(docbase) {
		this.options.docbase = docbase;
		this.reset();
		return this;
	},
	add: function(bucket) {
		
	},
	remove: function(bucket) {
		
	},
	buckets: function() {
		
	}
};

// class VHosts
function VHosts(server, mapping) {
	this.server = server;
	this.mapping(mapping);
	this.router = express();
}
VHosts.prototype = {
	mapping: function(mapping) {
		if( !arguments.length ) return this.mapping;
		if( typeof(mapping) === 'object' ) {
			this.mapping = mapping;
			// drop all buckets
			this.vhosts.forEach(function(vhost) {
				vhost.dropAll();
			});
			
			// rebound all buckets
		} else {
			console.error('illegal vhost mapping rule'.red, mapping);
		}
		return this;
	},
	// create new vhost
	create: function(options) {
		var router = this.router;
		var vhosts = this.vhosts;
		var v = vhosts[options.host] = new VHost(self, options);
		router.use(vhost(v.host, v.router));
	},
	// drop vhost
	drop: function(host) {
		
	},
	// get vhost names
	hostnames: function() {
		var arg = [];
		this.vhosts.forEach(function(vhost) {
			arg.push(vhost.host);
		});
		return arg;
	},
	all: function() {
		var arg = [];
		this.vhosts.forEach(function(vhost) {
			arg.push(vhost);
		});
		return arg;
	},
	// get vhost by name or bucket
	get: function(name) {
		if( !name ) return null;
		if( name instanceof Bucket ) return this.getByBucketName(name.name);
		
		return this.vhosts[name];
	},
	// get vhost by bucket name
	getByBucketName: function(name) {
		var bucket = name;
		var bucketname = bucket.name;
		
		var mapping = this.mapping;
		for(var k in mapping) {
			var regexp = new RegExp('^(' + k.split('*').join(').*(') + ')$');
			var matched = bucketname.match(regexp) ? true : false;
			if( matched ) {
				return this.get(k);
			}
		}
		
		return null;
	}
};

// mapping regexp test
(function() {
	var id = 'pluginname@version:bucketname';
	var input = 'pluginname@*:*';///^(pluginname).*(bucketname)/; ///pluginname@^.*/;
	var regexp = new RegExp('^(' + input.split('*').join(').*(') + ')$');
	//var regexp = new RegExp('^(pluginname).*(bucketname)$');

	console.log('id', id);
	console.log('input', input);
	console.log('regexp', regexp);
	console.log('test', id.match(regexp));
});

// class Server
function Server(options) {
	this.reset(options);
};

Server.prototype = {
	reset: function(options) {
		var options = this.options = options || this.options || {};
		var basedir = this.basedir = options.basedir || process.cwd();
		var setting = options.setting || {};
					
		var commons = express();
		
		var vhosts = new VHosts(this, {
			main: {
				host: options.host,
				forward: options.forward,
				docbase: options.docbase,
				bower: options.bower,
				statuspage: options.statuspage
			},
			vhost: options.vhost
		});
				
		var app = express();		
		// set settings
		app.set('json spaces', '\t');
		for(var k in setting ) {
			if( setting.hasOwnProperty(k) ) app.set(k, setting[k]);
		}		
		
		app.use(favicon(options.favicon || path.resolve(__dirname, '../www', 'favicon.ico')));
		app.use(fns.charset(options.charset || 'utf8'));
		app.use(methodoverride());
		app.use(session(options.session || { secret: 'tlzmflt' }));
		app.use(bodyparser.json());
		app.use(bodyparser.urlencoded({ extended: true }));
		app.use(multer());
		app.use(csurf());

		app.use(vhost.router);
		app.use(commons);
				
		this.router = app;
		this.vhosts = vhost;
				
		// translate vhost array to map
		var self = this;
		(options.vhost || []).forEach(function(option) {
			self.create(option);
		});
		
		return this;
	},
	
	// vhost find & create
	vhost: function(name, options) {
		if( arguments.length === 1 ) return this.vhosts.get(name);
		
		this.vhosts.create(name, options);
		return this;
	},
	
	// bucket bound & mount
	mount: function(uri, bucket) {
		if( !uri ) throw new TypeError('missing uri');
		if( uri.indexOf('/') ) uri = '/' + uri;
		
		// find mapped vhost
		
		
		return this;
	},
	unmount: function(bucket) {
		var router = this.mounted[path];
		root.use(path, null);
		
		return this;
	},
	mounts: function() {
		return this.mounted;
	},
	buckets: function(filter) {
	},
	
	// listen & close
	listen: function(port, ssl) {
		this.close();
		
		var callback;
		if( typeof(port) === 'function' ) {
			callback = port;
			port = null;
		}
		
		var ssl = ssl || this.options.ssl;
		var port = port || this.options.port || (ssl ? 9443 : 9080);		
		var app = this.router;
		
		var httpd;
		if( ssl ) httpd = https.createServer(ssl, app);
		else httpd = http.createServer(app);
		
		httpd.on('error', function (e) {
			if( callback ) callback(e);
			else if( e && e.code == 'EADDRINUSE' ) console.log('Port in use...', port);
			else console.log('Listen failure', e);
		});
		
		httpd.listen(port, function() {				
			if( callback ) callback(null, port);
			else console.log('HTTP Server listening on port ' + port);
		});

		Object.defineProperty(this, 'port', {
			value: port,
			configurable: true,
			enumerable: false,
			writable: false
		});
	
		Object.defineProperty(this, 'server', {
			value: httpd,
			configurable: true,
			enumerable: false,
			writable: false
		});
		
		return this;
	},
	close: function(callback) {
		if( this.server ) {
			var port = this.port;
			
			try {
				var self = this;
				this.server.close(function() {
					Object.defineProperty(self, 'port', {
						value: null,
						configurable: true,
						enumerable: false,
						writable: false
					});
		
					Object.defineProperty(self, 'server', {
						value: null,
						configurable: true,
						enumerable: false,
						writable: false
					});
				
					if( callback ) callback(null, port);
					else console.log('HTTP Server closed, port ' + port);
				});
			} catch(err) {
				if( callback ) callback(err);
				else throw err;
			}
		}
		return this;
	}
};

module.exports = Server;