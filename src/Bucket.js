var express = require('express');
var fs = require('fs');
var path = require('path');
var minimatch = require('minimatch');
var util = require('./util.js');

// class Bucket
function Bucket(id) {
	var docbase, filters = {};
	
	var router = express.Router();
	router.id = id;
	router.toString = function() {
		return 'router:' + (id || 'noname');
	};
	
	router.use(function(req, res, next) {
		if( req.server && req.server.debug ) util.debug([req.server, router], req.url);
		var origindocbase = req.docbase;
		var currentdocbase = docbase;		
		var filterchain = [];
		
		for(var pattern in filters) {
			var filter = filters[pattern];
		
			if( minimatch(req.url, pattern) ) {
				if( filter === false ) filterchain.push(false);
				else if( typeof filter === 'function' ) filterchain.push(filter);
				else if( Array.isArray(filter) ) filterchain = filterchain.concat(filterchain, filter);
			}
		}
		
		req.docbase = currentdocbase;
		
		var index = 0;
		var dispatch = function() {
			var fn = filterchain[index++];
			if( fn ) {
				fn(req, res, function(err) {
					if( err ) return next(err);
					dispatch();
				});
			} else {
				next();
				if( docbase ) express.static(docbase)(req, res, function() {});
			}
		};
		dispatch();
		
		req.docbase = origindocbase;
	});
	
	router.docbase = function(doc) {
		docbase = doc;
		return this;
	};
	
	router.filter = function(filter) {
		docbase = doc;
		return this;
	};
	
	router.static = function(uri, path) {
		this.use(uri, express.static(path));
		return this;
	};
	
	router.file = function(uri, path) {
		var fn = (function(path) {
			return function(req, res, next) {
				if( fs.existsSync(path) ) return res.sendfile(path);
				next();
			}
		})(path);
		this.use(uri, fn);
		return this;
	};
	
	router.remove = function(method, path) {
		if( method === 'all' ) method = '_all';
		this.stack.forEach(function(stack) {
			if( stack.path === path && stack.methods[method] ) {
				this.stack.splice(this.stack.indexOf(stack), 1);
			}
		});
		return this;
	};
	
	router.clear = function() {
		this.stack = [];
		return this;
	};
	
	return router;
};

module.exports = Bucket;