var Listener = require('./Listener.js');
var Server = require('./Server.js');
var Bucket = require('./Bucket.js');
var path = require('path');
var fs = require('fs');
var wrench = require('wrench');

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
		systemserver.mount('/libs', path.resolve(__dirname, '../bower_components'));
		
		systemserver.mount('/buckets.json', function(req, res, next) {
			res.send(buckets);			
		});
		
		var servers = config.servers;
		for( var k in servers ) {
			Server.create(k, servers[k]).listen();
		}
		
		if( !servers ) {
			var docbase = path.resolve(process.cwd(), 'www');
			if( !fs.existsSync(docbase) ) {
				fs.mkdirSync(docbase);
				wrench.copyDirSyncRecursive(path.resolve(__dirname, '../www'), docbase, {
					forceDelete: true,
					preserveFiles: true
				});
			}
			var defaultserver = Server.create('default', {
				docbase: docbase,
				mapping: '*'
			}).listen();
			defaultserver.mount('/libs', path.resolve(__dirname, '../bower_components'));
		}
		
		this.exports = {
			Server: Server,
			Listener: Listener,
			Bucket: Bucket,
			create: function(name) {
				name = name || 'default';
				var id = this.id ? this.id + ':' + name : name;
				
				if( buckets[id] ) return console.error('already exists bucket name', name);
				
				var bucket = new Bucket(id);
				bucket.mountToAll = function(uri) {
					Server.mountToAll(uri, this);
					return this;
				};
				bucket.mount = function(uri, tosystem) {
					Server.mount(uri);
					systemserver.mount(id, '/buckets/' + id, this);
					return this;
				};
				buckets[id] = bucket;
				return bucket;
			},
			mount: function(uri, bucket) {
				var bucketname = bucket.id || this.id.toString();
				Server.mount(bucketname, uri, bucket);
				return this;
			},
			mountToAll: function(uri, bucket) {
				Server.mountToAll(uri, bucket);
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
			var Workbench = ctx.require('plexi.workbench');
			var workbench = Workbench.create('system', path.resolve(__dirname, '../workbench'));			
			systemserver.mount('/', workbench.router);
		});
	},
	stop: function(ctx) {
		Listener.all().forEach(function(listener) {
			listener.close();
		});
		
		console.log('[' + ctx.id + '] stopped');
	}
};
