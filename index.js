/*jslint node: true */
var es = require('event-stream');

function createWait(done, start) {
	var num = 0;
	start = start || false;
	return function (handle, _start) {
		start = _start;
		num++;
		handle(function () {

			if ((--num) === 0 && start) {

				done();
			}
		});
	}
}

function onString(file, callback) {
	if (file.isBuffer()) {
		callback(String(file.contents));
	}
	else if (file.isStream) {
		var bufs = [];
		file.contents.on('data', function (d) {
			bufs.push(d);
		});
		file.contents.on('end', function () {
			callback(String(Buffer.concat(bufs)));
		});
	}
	else {
		callback("");
	}
}

module.exports = {
	toKissyJs: function (nameGetter) {
		return this.replace({patterns: [
			{
				match: /^[\s\S]+$/,
				replacer: function (file) {
					return function (content) {
						return 'KISSY.add("' + nameGetter(file) + '",function(){return ' + content + '});'
					}
				}
			}
		]})
	},
	toKissyCss: function (nameGetter) {
		return this.replace({patterns: [
			{
				match: /^[\s\S]+$/,
				replacer: function (file) {
					return function (content) {
						return 'KISSY.add("' + nameGetter(file) + '",function(S,D){return D.addStyleSheet((' + content + ')()) || null},{requires:["dom"]});'
					}
				}
			}
		]})
	},
	addSourceMapStyle: function (cfg) {
		return this.replace({patterns: [
			{
				match: /^[\s\S]+$/,
				replacer: function (file) {
					return function (content) {
						var list1 = [], list2 = [], list3 = [],listMap={};
						content = content.replace(/\/\*#\s*sourceMappingURL=data:application\/json;base64,([^\s]+)\s*\*\//g, function (source, jsonBase64) {
							var map = JSON.parse(new Buffer(jsonBase64, 'base64').toString());
							var name = cfg.nameGetter(file.relative),
								className = cfg.selectorGetter(name);
							listMap[name]=1;
							list1.push(name);
							list2.push(className);
							list3.push(className + ':before');
							for (var i = map.sources.length - 1; i >= 0; i--) {
								var relative = require("path").relative(cfg.rootDir, map.sources[i]);
								if (/\.\./.test(relative)) {continue;}
								name = cfg.nameGetter(relative);
								if(listMap[name]){continue;}
								listMap[name]=1;
								className = cfg.selectorGetter(name);
								list1.push(name);
								list2.push(className);
								list3.push(className + ':before');
							}
							return "";
						});
						return content + list2.join(",") + "{height:7px;}" + list3.join(",") + '{font-size:0;content:"' + list1.join(",") + '"}';
					}
				}
			}
		]})
	},
	toXtplJs:function(cfg){
		return this.replace({patterns: [
			{
				match: /^[\s\S]+$/,
				replacer: function (file) {
					return function (content) {
						return 'KISSY.add("' + cfg.nameGetter(file) + '",function(S,XTemplateRuntime){var module={};' + content + ';return function(data){module.instance=module.instance||new XTemplateRuntime(module.exports);return module.instance.render(data);};},{requires:["kg/xtemplate/' + cfg.xtplVersion + '/runtime"]});'
					}
				}
			}
		]})
	},
	prependPipe: function (replacer, spliter) {
		return this.replace({patterns: [
			{
				match: /^/,
				replacement: spliter || ""
			},
			{
				match: /^/,
				replacer: replacer
			}
		]});
	},
	appendPipe: function (replacer, spliter) {
		return this.replace({patterns: [
			{
				match: /$/,
				replacement: spliter || ""
			},
			{
				match: /$/,
				replacer: replacer
			}
		]});
	},
	replace: function (option) {
		return es.map(function (file, callback) {
			var patterns = {},
				contents,
				wait = createWait(function () {
					for (var key in patterns) {
						var pattern = patterns[key];
						contents = contents.replace(pattern.match, pattern.replacement);
					}
					file.contents = new Buffer(contents);
					callback(null, file);
				});

			wait(function (callback) {
				onString(file, function (str) {
					contents = str;
					callback();
				});
			});

			function prepare(_pattern, pattern) {
				pattern.match = _pattern.match;
				pattern.replacement = _pattern.replacement;
				if (_pattern.replacer) {
					pattern.replacement = _pattern.replacer(file);
				}
				if (!pattern.replacement) {
					return;
				}
				var replacement = pattern.replacement;
				if (replacement.pipe) {
					wait(function (callback) {
						replacement.pipe(es.map(function (file, _callback) {
							onString(file, function (str) {
								_callback(null, file);
								pattern.replacement = function () {
									return str
								};
								callback();
							});
						}));
					});
				}
			}

			for (var key in option.patterns) {
				prepare(option.patterns[key], patterns[key] = {});
			}
			wait(function (callback) {
				callback();
			}, true);
		});
	}
}