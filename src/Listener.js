var http = require('http');
var fs = require('fs');
var path = require('path');
var express = require('express');
var vhost = require('vhost');
var util = require('./util.js');

// class Bucket
function Listener(options) {
	if( typeof options !== 'object' || typeof options.port !== 'number' || options.port <= 0 || options.port > 65535 || isNaN(options.port) ) throw new Error('illegal options:' + options);

	this.options = options;
	this.port = options.port;
	this.servers = [];
};

Listener.prototype = {
	join: function(server) {
		if( ~this.servers.indexOf(server) ) return util.error(this, 'already joined', server);
		this.servers.push(server);
		return this;
	},
	drop: function(server) {
		if( !~this.servers.indexOf(server) ) return util.error(this, 'not a member', server);
		this.servers.splice(servers.indexOf(server), 1);
		return this;
	},
	isListen: function() {
		return this.httpd ? true : false;	
	},
	has: function(server) {
		return ~this.servers.indexOf(server) ? true : false;
	},
	listen: function(callback) {
		if( this.httpd ) return util.error(this, 'already listen', this.port);
		
		var self = this;
		var options = this.options;
		var port = options.port;
		var ssl = ssl || options.ssl;
		
		// default callback
		callback = callback || function(err, port) {
			if( err && err.code == 'EADDRINUSE' ) return util.error(self, 'Port in use...', port);
			else if( err ) return util.error(self, 'Listen failure', port, err);			
			util.debug(self, 'HTTP listening on port ' + port);
		};
		
		if( typeof port !== 'number' ) return callback('invalid port:' + port) ? null : null;
		
		var servers = this.servers;
		var router = function(req, res) {
			var index = 0;
			var dispatch = function() {
				var server = servers[index++];
				if( server && server.router ) {
					server.router(req, res, function(err) {
						if( err ) util.error(server, err);
						dispatch();
					});
				} else {
					res.statusCode = 404;
					res.end('Not Found');
				}
			};
			dispatch();
		};
		
		var httpd;
		if( ssl ) httpd = https.createServer(ssl, router);
		else httpd = http.createServer(router);
		
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
		var self = this;
		callback = callback || function(err, port) {
			if( err ) return util.error(self, 'Listener close failure', port, err);
			util.debug(self, 'HTTP closed successfully, port' + port);			
		};
		
		if( this.httpd ) {
			var port = this.port;
			this.httpd.close(function() {
				callback(null, port);
				
				self.httpd = null;
				self.port = null;
			});
		} else {
			callback('listener already closed', this.options.port);
		}
		return this;
	},
	toString: function() {
		return 'listener:' + this.port;
	}
};


var listeners = {};
var create = function(options) {
	if( typeof options === 'number' ) options = {port:options};
	if( typeof options !== 'object' ) return util.error('Listener', 'illegal listener options', options);
	if( typeof options.port !== 'number' || options.port <= 0 || options.port > 65535 || isNaN(options.port) ) return util.error('Listener', 'illegal port number(port>0)', port);

	return listeners[options.port.toString()] = new Listener(options);
};

var get = function(port) {
	return listeners[port.toString()];
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