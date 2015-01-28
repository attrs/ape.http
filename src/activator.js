var Listener = require('./Listener.js');
var Server = require('./Server.js');
var Bucket = require('./Bucket.js');
var path = require('path');

var buckets = {};

module.exports = {
	start: function(ctx) {
		var config = ctx.preference;
				
		var listeners = config.listeners || [];
		listeners.forEach(function(options) {
			Listener.create(options);
		});
		
		var systemserver = Server.create('system', {
			docbase: path.resolve(__dirname, '../www'),
			port: 19000
		}).listen();
		
		var servers = config.servers;		
		for( var k in servers ) {
			Server.create(k, servers[k]).listen();
		}
		
		return {
			Server: Server,
			Listener: Listener,
			Bucket: Bucket,
			systemserver: systemserver,
			create: function(name) {
				name = name || 'default';
				var bucketname = this.id + ':' + name;
				
				var bucket = new Bucket();
				bucket.mount = function(uri, tosystem) {
					var servers = Server.finds(bucketname);
					if( !servers ) return this;
					servers.forEach(function(server) {
						server.mount(uri, bucket);						
					});
					
					if( tosystem !== false ) systemserver.mount(uri, this);
					return this;
				};
				bucket.name = bucketname;
				
				buckets[bucketname] = bucket;
				return bucket;
			},
			drop: function(name) {
				name = name || 'default';
				var bucketname = this.id + ':' + name;
				
				var servers = Server.finds(bucketname);
				if( !servers ) return this;
				
				var bucket = buckets[bucketname];
				servers.forEach(function(server) {
					server.unmount(bucket);			
				});
				systemserver.unmount(bucket);
				return this;
			},
			server: function(name, options) {
				if( arguments.length === 1 ) return Server.get(name);
				return Server.create(name, options);
			},
			servers: function() {
				return Server.all();				
			},
			listener: function(port) {
				return Listener.get(port);
			},
			listeners: function() {
				return Listener.all();
			}
		};
	},
	stop: function(ctx) {
		Listener.all().forEach(function(listener) {
			listener.close();
		});
		
		console.log('[' + ctx.id + '] stopped');
	}
};

/*
		// in plugin
		var http = ctx.require('plexi.http');	
	
		var bucket = http.create('name');
		bucket.static('images', path.join(__dirname, 'www/images'));
		bucket.get('server', function(req, res, next) {
			res.send('ok.');
		});
		bucket.mount('/test');
		var server = bucket.server();
		var listener = server.listener();
		listener.stop().start();
*/