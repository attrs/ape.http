var Listener = require('./Listener.js');
var Server = require('./Server.js');
var Bucket = require('./Bucket.js');
var path = require('path');
var fs = require('fs');

var buckets = {};

module.exports = {
	start: function(ctx) {
		var config = ctx.preference;
						
		var listeners = config.listeners || [];
		listeners.forEach(function(options) {
			Listener.create(options);
		});
		
		var systemserver = Server.create('system', {
			port: 19000
		}).listen();
		
		systemserver.mount('/buckets.json', function(req, res, next) {
			res.send(buckets);			
		});
		
		var servers = config.servers;
		for( var k in servers ) {
			Server.create(k, servers[k]).listen();
		}
		
		if( !servers ) {
			var docbase = path.resolve(process.cwd(), 'www');
			if( !fs.existsSync(docbase) ) fs.mkdirSync(docbase);
			Server.create('default', {
				docbase: docbase
			}).listen();
		}
		
		this.exports = {
			Server: Server,
			Listener: Listener,
			Bucket: Bucket,
			create: function(name) {
				name = name || 'default';
				var bucketname = this.id ? this.id + ':' + name : name;
				
				if( buckets[bucketname] ) return console.error('already exists bucket name', bucketname);
				
				var bucket = new Bucket();
				bucket.mountToAll = function(uri) {
					if( !uri ) return console.error('invalid uri', uri);
					
					var servers = Server.all();
					if( servers ) {
						servers.forEach(function(server) {
							server.mount(uri, bucket);
						});
					}
					return this;
				};
				bucket.mount = function(uri, tosystem) {
					if( !uri ) return console.error('invalid uri', uri);
					
					var servers = Server.finds(bucketname);
					if( servers ) {
						servers.forEach(function(server) {
							server.mount(uri, bucket);						
						});
					}
					
					if( tosystem !== false ) systemserver.mount('/buckets/' + bucketname, this);
					return this;
				};
				bucket.name = bucketname;
				
				buckets[bucketname] = bucket;
				return bucket;
			},
			mount: function(uri, bucket) {
				var servers = Server.finds(bucket.name || 'noname');
				if( !servers ) return console.error('[http] cannot found matched server(from ' + this.id + ')', uri, bucket.name);
				
				servers.forEach(function(server) {
					server.mount(uri, bucket);						
				});
				return this;
			},
			drop: function(name) {
				name = name || 'default';
				var bucketname = this.id ? this.id + ':' + name : name;
				
				var bucket = buckets[bucketname];
				if( bucket ) {
					var servers = Server.finds(bucketname);
					if( servers ) {					
						servers.forEach(function(server) {
							server.unmount(bucket);			
						});
					}
					systemserver.unmount(bucket);
				}
				
				buckets[bucketname] = null;
				delete buckets[bucketname];
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
			},
			filter: function(name, filter) {
				return Server.filter.apply(Server, arguments);
			}
		};
		
		// create system workbench
		process.nextTick(function() {
			var wb = ctx.require('plexi.workbench');
			var workbench = wb.create('system', path.resolve(__dirname, '../workbench'));			
			systemserver.mount('/', workbench.bucket);
		});
	},
	stop: function(ctx) {
		Listener.all().forEach(function(listener) {
			listener.close();
		});
		
		console.log('[' + ctx.id + '] stopped');
	}
};
