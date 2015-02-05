var express = require('express');
var fs = require('fs');
var path = require('path');

// class Bucket
function Bucket() {	
	this.router = express.Router();
};

Bucket.prototype = {
	docbase: function(docbase) {
		this.docbase = docbase;
		return this;	
	},
	use: function(uri, fn) {
		if( uri instanceof Bucket ) this.router.use(uri.router);
		if( fn instanceof Bucket ) this.router.use(uri, fn.router);
		
		if( typeof(uri) === 'function' ) return this.router.use(uri);
		this.router.use(uri, fn);
		return this;
	},
	all: function(uri, fn) {
		this.router.all(uri, fn);
		return this;
	},
	get: function(uri, fn) {
		this.router.get(uri, fn);
		return this;
	},
	post: function(uri, fn) {
		this.router.post(uri, fn);
		return this;
	},
	put: function(uri, fn) {
		this.router.put(uri, fn);
		return this;
	},
	del: function(uri, fn) {
		this.router.delete(uri, fn);
		return this;
	},
	delete: function(uri, fn) {
		this.router.delete(uri, fn);
		return this;
	},
	options: function(uri, fn) {
		this.router.options(uri, fn);
		return this;
	},
	static: function(uri, path) {
		this.router.use(uri, express.static(path));
		return this;
	},
	file: function(uri, path) {
		var fn = (function(path) {
			return function(req, res, next) {
				if( fs.existsSync(path) ) return res.sendfile(path);
				next();
			}
		})(path);
		this.router.use(uri, fn);
		return this;
	},
	remove: function(method, path) {
		if( method === 'all' ) method = '_all';
		this.router.stack.forEach(function(stack) {
			if( stack.path === path && stack.methods[method] ) {
				this.router.stack.splice(this.router.stack.indexOf(stack), 1);
			}
		});
		return this;
	},
	clear: function() {
		this.router.stack = [];
		return this;
	}
};

module.exports = Bucket;