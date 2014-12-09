var express = require('express');
var fs = require('fs');
var path = require('path');

function print_bound(bucket, uri, method) {
	console.log('[' + bucket.name + '] ' + method + ' ' + uri);
}

// class Bucket
function Bucket(name) {
	if( !name || typeof(name) !== 'string' ) throw new Error('illegal argument:name:' + name);
	
	this.name = name;
	this.router = express();
};

Bucket.prototype = {
	filter: function(fn) {
		return this.router.use(fn);
	},
	bucket: function(uri, bucket) {
		if( !(bucket instanceof Bucket) ) return console.error('invalid bucket', uri, bucket);
		this.router.use(uri, bucket.body);
		return this;
	},
	use: function(uri, fn) {
		if( typeof(uri) === 'function' ) return this.filter(uri);
		
		print_bound(this, uri, 'ALL');
		this.router.use(uri, fn);
		return this;
	},
	get: function(uri, fn) {
		print_bound(this, uri, 'GET');
		this.router.get(uri, fn);
		return this;
	},
	post: function(uri, fn) {
		print_bound(this, uri, 'POST');
		this.router.post(uri, fn);
		return this;
	},
	put: function(uri, fn) {
		print_bound(this, uri, 'PUT');
		this.router.put(uri, fn);
		return this;
	},
	del: function(uri, fn) {
		print_bound(this, uri, 'DELETE');
		this.router.delete(uri, fn);
		return this;
	},
	delete: function(uri, fn) {
		print_bound(this, uri, 'DELETE');
		this.router.delete(uri, fn);
		return this;
	},
	options: function(uri, fn) {
		print_bound(this, uri, 'OPTIONS');
		this.router.options(uri, fn);
		return this;
	},
	static: function(uri, path) {
		if( fs.statSync(path).isFile() ) {
			this.file(uri, path);
		} else {
			this.dir(uri, path);
		}
		return this;
	},
	dir: function(uri, path) {
		print_bound(this, uri, 'DIR');
		this.router.use(uri, express.static(path));
		return this;
	},
	file: function(uri, path) {
		print_bound(this, uri, 'FILE');
		var fn = (function(path) {
			return function(req, res, next) {
				if( fs.existsSync(path) ) return res.sendfile(path);
				next();
			}
		})(path);
		this.router.use(uri, fn);
		return this;
	},
	remove: function(method, uri) {
		print_bound(this, uri, method + '(remove)');
		var arg = this.router.routes[method];
		if( arg ) {
			for(var i=0; i < arg.length; i++) {
				var o = arg[i];
				if( o.path === uri ) delete arg[i];				
			}
		}
		return this;
	},
	clear: function() {
		this.router.routes = {};
		return this;
	}
};

module.exports = Bucket;