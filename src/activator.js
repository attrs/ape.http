var https = require('https');
var http = require('http');
var express = require('express');
var fs = require('fs');
var path = require('path');
var middlewares = require('./middlewares.js');
var Server = require('./Server.js');
var Bucket = require('./Bucket.js');
var wrench = require('wrench');

var servers = {};
var buckets = {};

module.exports = {
	detect: function(ctx) {
		ctx.services.create('http', {
			create: function(config) {
				return new Bucket(this, config);				
			}
		});
		
		// in plugin
		var http = ctx.services.get('http');		
		var bucket = http.create('a');
		bucket.static('images', path.join(__dirname, 'www/images'));
		bucket.get('server', function(req, res, next) {
			res.send('ok.');
		});
		bucket.mount('/test');
		var server = bucket.server();
		server.stop().start();
	},
	start: function(ctx) {
		var options = ctx.preference;
		options.servers = options.servers || {default:options};
		
		for(var k in options.servers) {
			var serveropt = options.servers[k] || {
				docbase: 'www'
			};
			
			serveropt.name = k;
			serveropt.basedir = serveropt.basedir || ctx.home;
			
			var server = new Server(serveropt).listen();
			servers[k] = server;
		}
		
		function getServer(plugin, bucketname) {
			if( !plugin || !plugin.id ) return null;
			for(var k in servers) {
				var server = servers[k];
				if( bucketname && server.hasMapping(plugin.id.toString() + ':' + bucketname) ) return server;
				if( server.hasMapping(plugin.id.toString()) ) return server;
				if( server.hasMapping(plugin.name) ) return server;
			}
			return null;
		}
		
		return {
			create: function(bucketname) {
				var server = getServer(this);
				return host.create(this, this.id.toString() + (bucketname ? ':' + bucketname : ':default'));
			},
			buckets: function(plugin) {
				var server = getServer(this);
				return server.buckets(this.id.toString());
			},
			bucket: function(bucketname) {
				var server = getServer(this, bucketname);
				return server.bucket(this.id.toString() + (bucketname ? ':' + bucketname : ':default'));
			},
			server: function(name, options) {
				// find by plugin mappings
				if( !arguments.length ) return serverByPlugin(this);
				
				if( arguments.length === 1 ) {
					// find by bucket
					if( name instanceof Bucket ) {
						for(var k in servers) {
							var server = servers[k];
							if( server.hasBucket(name) ) return server;
						}
						return null;
					}
				
					// find by servername
					if( typeof(name) === 'string' ) return servers[name];
					// find by port number
					if( typeof(name) === 'number' ) {
						for(var k in servers) {
							var server = servers[k];
							if( server.port === name ) return server;
						}
						return null;
					}
				} else {
					if( typeof(name) !== 'string' ) throw new TypeError('illegal name(string):' + name);
					
				}
				
				return null;				
			},
			servers: function() {
				var arg = [];
				for(var k in servers) {
					arg.push(k);
				}
				return arg;
			},
			get provider() {
				return ctx.name;
			},
			get version() {
				return ctx.version;
			},
			get engine() {
				return 'Express 3.x';
			}
		};
	},
	stop: function(ctx) {
		for(var k in servers) {
			var server = servers[k];
			server.stop();
		}
		console.log('[' + ctx.id + '] stopped');
	}
};
