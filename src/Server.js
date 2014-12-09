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

var fs = require('fs');
var path = require('path');
var uuid = require('uuid');
var https = require('https');
var http = require('http');
var fns = require('./fns.js');

//console.log('stack', app.stack);
//console.log('routes', app.routes);

// class Cors
function Cors(options) {
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
function VHost(options) {
	this.router = express();
	this.reset(options);
}
VHost.prototype = {
	reset: function(options) {
		var options = this.options = options || this.options || {};
		
		var app = this.router;
		app.use(vhost(options.host, fns.docbase(options.docbase)));
			
		return this;
	},
	docbase: function(docbase) {
		this.options.docbase = docbase;
		this.reset();
		return this;
	}
};

// class VHosts
function VHosts(options) {
	this.router = express();
	this.reset(options);
}
VHosts.prototype = {
	reset: function(options) {
		var options = this.options = options || this.options || {};
		
		var basedir = options.basedir || process.cwd();
		var main = options.main;
		var vhosts = options.vhost || [];
		var mapping = options.mapping;
		
		return this;
	},
	create: function(name, options) {
		
	},
	get: function(name) {
		
	},
	mapped: function() {
		
	}
};


// class Server
function Server(options) {	
	this.reset(options);
};

Server.prototype = {
	reset: function(options) {
		var options = this.options = options || this.options || {};
			
		var basedir = options.basedir || process.cwd();
		var cors = new Cors(options.cors);		
		var vhosts = new VHosts({
			basedir: basedir,
			main: {
				host: options.host,
				forward: options.forward,
				docbase: options.docbase,
				bower: options.bower,
				statuspage: options.statuspage
			},
			vhost: options.vhost
		});
		
		var commons = express();
		
		var app = express();
		app.set('json spaces', '\t');
		app.set('x-powered-by', false);
		app.use(fns.charset(options.charset || 'utf8'));
		app.use(csurf());
		app.use(favicon(options.favicon || path.resolve(__dirname, '../www', 'favicon.ico')));

		app.use(bodyparser.json());
		app.use(bodyparser.urlencoded({ extended: true }));
		app.use(multer());
		app.use(cookieparser());
		app.use(methodoverride());
		
		app.use(cors.router);
		
		app.use(fns.logging(options.logging));
		app.use(vhosts.router);
		app.use(commons);
		
		this.cors = cors;
		this.vhosts = vhosts;
		this.commons = commons;
		this.router = app;
		
		return this;
	},
	
	// vhost find & create
	vhost: function(name, options) {
		if( arguments.length === 1 ) return this.vhosts.get(name);
		
		this.vhosts.create(name, options);
		return this;
	},
	
	// bucket bound & mount
	mapped: function(name) {
		return this.vhosts.mapped(name);
	},
	mount: function(uri, bucket) {
		if( !uri ) throw new TypeError('missing uri');
		if( uri.indexOf('/') ) uri = '/' + uri;
		
		// find mapped vhost
		
		
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
	buckets: function(plugin) {
		if( !arguments.length ) plugin = this;
		
		return Bucket.get(this.id.toString());
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