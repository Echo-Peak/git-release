var fs = require('fs');
var path = require('path');
var semver = require('semver');
var shell = require('shelljs');
var inquirer = require('inquirer');
var packagers = require('./packagers');
require('array.prototype.find');

function bump(filenames, version, parent) {
  filenames.forEach(function(filename) {
    var packager = packagers.all.find(function (pack) { return pack.file == path.basename(filename); });
    if (packager) {
      packager.bump(version, filename, parent);
    }
  });
}

function hook(name, version) {
  var hook = path.join('.git', 'hooks', name);
  if (fs.existsSync(hook)) {
    shell.exec(hook + ' ' + version);
  }
}

function git(version, tag, filenames , override) {
  hook('pre-release', version);
  shell.exec('git add ' + filenames.join(' '));
  run('git commit -m "Version ' + version + '"', filenames.join(' ') + ' committed');
  run('git tag -a ' + tag + ' -m "Tag ' + tag + '"', 'Tag ' + tag + ' created');
  if(!override){
    run('git push', 'Pushed to remote');
    run('git push --tags', 'Pushed new tag ' + tag + ' to remote');
  }
  hook('post-release', version);
}

function run(cmd, msg) {
  shell.exec(cmd, {silent: true});
  console.log(msg);
}

function release(type, files, parent, willForcePush, callback) {
  var packager;
  packagers.all.forEach(function(pack) {
    if (!packager && fs.existsSync(pack.file)) {
      packager = pack;
    }
  });
  if (!packager) {
    callback(new Error('No packager found !'));
  } else {
    console.log('Using packager', packager.name);
    var identifier = type || 'patch';
    var currentVersion = packager.version();
    var newVersion = semver.inc(currentVersion, identifier) || identifier;
    var types = ['major', 'minor', 'patch', 'dev', 'alpha'];
    var choices = types.map(function (type) {
      var channel = false;
      if(type === 'dev' || type === 'alpha'){
        channel = type;
        type = 'prerelease'
      }
      var version = semver.inc(currentVersion, type , channel);
      return { name:`${version} (Increment ${type} ${channel} version)`, value: version };
    });
    choices.push({name: newVersion + ' (Custom version)', value: newVersion});
    choices.push(new inquirer.Separator());
    let dontpush = {
      name:`Create the tag ${newVersion} but do not push to remote(only local)`, value: 'dont-push' , version: newVersion
    }
    choices.push(dontpush);
    var filenames = files || packagers.all.filter(function (pack) {
      return fs.existsSync(pack.file);
    }).map(function (pack) {
      return pack.file;
    });
    inquirer.prompt([{
      type: 'list',
      name: 'version',
      message: 'Which version do you want to release ?',
      choices: choices.concat([
        new inquirer.Separator(), { name: 'Exit (Don\'t release a new version)', value: 'exit' }
      ]),
      default: newVersion
    }], function(answers) {
      var version = answers.version;
      if(version === 'exit'){
        callback(false);
        return
      }
      if (version !== 'exit') {
        var push = true;
        console.log('Version bumped to ' + version);
        if(version === 'dont-push'){ 
          version = dontpush.version;
          push = false;
        }
        var tag = 'v' + version;
        console.log('Version bumped to ' + version);
          bump(filenames, version, parent);
        git(version, tag, filenames, push);
        callback(true);
      } else{
        callback(false);
      }
    });
  }
}

module.exports = release;
