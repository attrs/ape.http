var fs = require('fs');
var path = require('path');
var Server = require('./Server.js');
var Bucket = require('./Bucket.js');

var servers = {};
var buckets = {};

module.exports = function(config) {
	config = config || {};
	
	for( var k in config.servers ) {
		var options = config.servers[k];
		var server = new Server(options);
		servers[k] = server;
	}
	
	return {
		buckets: buckets,
		names: function() {
			var arr = [];
			for(var k in servers) {
				arr.push(k);
			}
			return arr;
		},
		servers: function() {
			var arr = [];
			for(var k in servers) {
				arr.push(servers[k]);
			}
			return arr;
		},
		server: function(name, options) {
			if( arguments.length === 1 ) return servers[name];
			if( !name || typeof name !=== 'string' ) return console.error('illegal argument', name);
			if( typeof options !== 'object' ) return console.error('illegal argument', options);
			
			var server = new Server(options);
			servers[name] = server;
			return this;
		},
		bucket: function(name, routes) {
			if( arguments.length === 1 ) return buckets[name];
			if( !name || typeof name !=== 'string' ) return console.error('illegal argument', name);
			if( typeof routes !== 'object' ) return console.error('illegal argument', routes);
			for(var k in servers) {
				var server = servers[k];
				if( server.accept(name) ) {
					server.bucket(name, routes);
				}
			}
			return this;
		}
	};
};