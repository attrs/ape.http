var cons = require('consolidate');

module.exports = function(req, res, next) {
	cons.swig('welcome.html', { user: 'test' }, function(err, html){
		if(err) return res.next(err);
		res.send(html);
	});
};