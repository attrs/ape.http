var http = require('http');
var express = require('express');
var fs = require('fs');
var path = require('path');

// class Bucket
function Listener(options) {
	if( typeof options !== 'object' || typeof options.port !== 'number' || options.port <= 0 ) throw new Error('illegal options:' + options);

	this.options = options;
	this.port = options.port;
	this.servers = [];
	this.app = express();
};

Listener.prototype = {
	join: function(server) {
		if( ~this.servers.indexOf(server) ) return console.error('already joined', server);
				
		// host
		var app = this.app;
		var servers = this.servers;
		var router = function(req, res, next) {
			server.router(req, res, next);
		};
		
		server.router.__router = router;		
		servers.push(server);
		app.use(router);
		
		return this;
	},
	drop: function(server) {
		if( !~this.servers.indexOf(server) ) return console.error('not a member', server);
		var app = this.app;
		var router = server.router.__router;
		
		var stack = app._router.stack;
		stack.forEach(function(s) {
			if( s.handle === router ) stack.splice(stack.indexOf(s), 1);
		});

		var servers = this.servers;
		for(var index; ~(index = servers.indexOf(server));) {
			servers.splice(servers.indexOf(server), 1);
		}
		return this;
	},
	isListen: function() {
		return this.httpd ? true : false;	
	},
	listen: function(callback) {
		if( this.httpd ) return console.error('already listen', this.port);
		
		// default callback
		callback = callback || function(err, port) {
			if( err && err.code == 'EADDRINUSE' ) return console.error('Port in use...', port);
			else if( err ) return console.error('Listen failure', port, err);			
			console.log('HTTP listening on port ' + port);
		};
		
		var app = this.app;
		var options = this.options;
		var port = options.port;
		var ssl = ssl || options.ssl;
		
		if( typeof port !== 'number' ) return callback('invalid port:' + port) ? null : null;
		
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
	close: function(callback) {
		callback = callback || function(err, port) {
			if( err ) return console.error('Listener close failure', port, err);
			console.log('HTTP closed successfully, port' + port);			
		};
		
		if( this.httpd ) {
			var port = this.port;			
			var self = this;
			this.httpd.close(function() {
				callback(null, port);
				
				self.httpd = null;
				self.port = null;
			});
		} else {
			callback('listener already closed', this.options.port);
		}
		return this;
	}
};


var listeners = {};
var create = function(options) {
	if( typeof options === 'number' ) options = {port:options};
	if( typeof options !== 'object' ) return console.error('illegal listener options', options);
	
	return listeners[options.port + ''] = new Listener(options);
};

var get = function(port) {
	var listener = listeners[((typeof port === 'number' && port >= 0) ? port : 9000) + ''];
	if( !listener ) listener = create({port: ((typeof port === 'number' && port >= 0) ? port : 9000) });
	return listener;
};

var all = function() {
	var arr = [];
	for(var k in listeners) {
		arr.push(listeners[k]);
	}
	return arr;
};

module.exports = {
	create: create,
	get: get,
	all: all
};