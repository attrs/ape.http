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
	if( options && typeof options !== 'object' ) return console.error('illegal argument', options);
	this.options = options || {};
	this.router = express();
};

Server.prototype = {
	// listen & close
	listen: function(callback) {
		if( this.httpd ) return console.error('already listen', this.port);
		
		var cwd = process.cwd();
		var options = this.options;
		var variables = options.variables || {};
				
		var app = express();
				
		// set settings
		app.set('json spaces', '\t');
		for(var k in variables ) app.set(k, variables[k]);
		
		app.use(fns.logging(options.logging));		
		if( options.favicon ) app.use(favicon(options.favicon));
		if( options.compress ) app.use(compression( (typeof options.compress === 'number' ? {threshold: options.compress} : {}) ));
		app.use(fns.charset(options.charset || 'utf8'));
		app.use(methodoverride());
		app.use(cookiesession(options.session || { secret: 'tlzmflt' }));
		app.use(bodyparser.json());
		app.use(bodyparser.urlencoded({ extended: true }));
		app.use(multer());
		app.use(csurf());
		app.use(this.router);
		
		// mount
		for(var file in options.mount) {
			var p = options.mount[file];
			app.use(p, express.static(path.resolve(cwd, file)));
		}
		
		// host & docbase
		var docbase = options.docbase;
		if( options.host ) {
			var _app = app;
			app = express();
			app.use(vhost(options.host, _app));
			
			if( docbase ) {
				app.use(function(req, res, next) {
					var dir;		
					if( typeof docbase === 'object' ) {
						var host = req.hostname;
						dir = docbase[host];
						if( !dir ) dir = docbase['*'];
					} else if( typeof docbase === 'string' ){
						dir = docbase;
						
						if( req.vhost && ~docbase.indexOf(':') ) {
							dir = dir.split(':1').join(req.vhost[0])
							.split(':2').join(req.vhost[1])
							.split(':3').join(req.vhost[2])
							.split(':4').join(req.vhost[3])
							.split(':5').join(req.vhost[4]);
						}
					}
					if( dir ) express.static(path.resolve(cwd, dir))(req, res, next);
					else res.sendStatus(404);
				});
			}
		} else {
			if( typeof docbase === 'string' ) {
				app.use(express.static(path.resolve(cwd, docbase)));
			} else if( typeof docbase === 'object' ) {
				app.use(function(req, res, next) {
					var host = req.hostname;
					var dir = docbase[host];
					if( !dir ) dir = docbase['*'];
					if( dir ) express.static(path.resolve(cwd, dir))(req, res, next);
					else res.sendStatus(404);
				});
			}
		}
		
		if( options.statuspage ) {
			app.use('/status.json', function(req, res, next) {
				res.send(options.status || {
					options: options,
					port: port
				});
			});
		}
		
		// default callback
		callback = callback || function(err, port) {
			if( err && err.code == 'EADDRINUSE' ) console.log('Port in use...', port);
			else if( err ) console.log('Listen failure', err);
			
			console.log('HTTP Server listening on port ' + port, docbase || '(no docbase)');
		};
		
		
		// create server		
		var ssl = ssl || options.ssl;
		var port = port || options.port || (ssl ? 9443 : 9080);		
		
		var httpd;
		if( ssl ) httpd = https.createServer(ssl, app);
		else httpd = http.createServer(app);
		
		httpd.on('error', function (e) {
			callback(e, port);
		});		
		httpd.listen(port, function() {				
			callback(null, port);
		});

		this.httpd = httpd;
		this.port = port;
		
		return this;
	},
	mount: function(uri, bucket) {
		if( typeof uri !== 'string' || uri.indexOf('/') !== 0 ) return console.error('invalid uri', uri);
		if( !bucket || !bucket.router ) return console.error('invalid bucket', bucket);
		this.router.use(uri, bucket.router);
		return this;
	},
	close: function(callback) {
		if( this.httpd ) {
			var port = this.port;			
			var self = this;
			this.httpd.close(function() {
				if( callback ) callback(null, port);
				else console.log('HTTP Server closed, port ' + port);
				
				self.server = null;
				self.port = null;
			});
		} else {
			if( callback ) callback('server is not listen');
		}
		return this;
	}
};

var filters = {};
Server.filter = function(name, filter) {
	if( typeof name !== 'string' || !name ) return console.error('illegal argument', name);
	if( typeof filter !== 'function' ) return console.error('filter must be a function', filter);
	filters[name] = filter;
	return this;
};

module.exports = Server;