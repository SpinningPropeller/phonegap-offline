/*jslint node: true, nomen: true */

/*
 * grunt-phonegap-offline
 *
 *
 * Copyright (c) 2015 Lonny Gomes
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function (grunt) {
    var _ = require('lodash'),
        path = require('path'),
        q = require('q'),
        plist = require('plist'),
        fs = require('fs-extra'),
        settingsKey = 'phonegap_offline.settings',
        settingsDefaults = {
            command: 'phonegap',
            basePath: '.',
            appId: 'com.test.testapp',
            appName: 'TestApp',
            platforms: [
                'invalid'
            ],
            templates: {
                www: 'test/fixtures/www_invalid',
                ios: 'test/fixtures/ios_invalid'
            }
        },
        supportedPlatforms = [ 'ios' ],
        requiredTemplates = [ 'www' ],
        description = 'Phonegap wraper for offline configruations';

    function phonegapCopyIcons(settings, platform) {
        var defer = q.defer(),
            iconMap =  {
                ios: {
                    icon29: 'icon-small.png',
                    icon29x2: 'icon-small@2x.png',
                    icon40: 'icon-40.png',
                    icon40x2: 'icon-40@2x.png',
                    icon57: 'icon.png',
                    icon57x2: 'icon@2x.png',
                    icon60: 'icon-60.png',
                    icon60x2: 'icon-60@2x.png',
                    icon72: 'icon-72.png',
                    icon72x2: 'icon-72@2x.png',
                    icon76: 'icon-76.png',
                    icon76x2: 'icon-76@2x.png'
                }
            },
            destPath = {
                ios: path.resolve(
                    settings.basePath,
                    'platforms',
                    'ios',
                    settings.appName,
                    'Resources',
                    'icons'
                )
            },
            copyIcons = function (curPlatform) {
                var srcIcons = settings.icons[curPlatform],
                    destIcons = iconMap[curPlatform],
                    msg,
                    curSrc,
                    curDest;

                if (!destIcons || !srcIcons) {
                    defer.reject('Invalid platform!');
                    grunt.fail.warn('Invalid platform supplied!');
                    return;
                }

                //check if destination base path exists before continuing
                if (!grunt.file.exists(destPath[curPlatform])) {
                    grunt.log.error('Icon path for ' + curPlatform +
                                    ' does not exist. ' + 'The platform must ' +
                                    'be added!');
                    defer.resolve();
                    return;
                }

                grunt.log.subhead('Copying icons for ' + curPlatform + ' platform ...');
                //loop through supplied platform icons to copy
                Object.keys(srcIcons).forEach(function (curKey) {
                    curSrc = srcIcons[curKey];

                    if (!grunt.file.exists(curSrc)) {
                        msg = curKey + ' for the ' + curPlatform +
                              ' platform does not exist ... skipping!';

                        grunt.log.error(msg);
                        return;
                    }

                    try {
                        grunt.log.write(grunt.log.wordlist([
                            'Copying',
                            curKey,
                            '..\t'
                        ], {separator: ' '}));

                        //check if curKey is a valid key
                        if (!destIcons[curKey]) {
                            throw new Error(curKey +
                                ' is an invalid  parameter' + ' for the ' +
                                curPlatform + ' platform!');
                        }

                        //derive the destination given platform and icon map
                        curDest = path.resolve(destPath[curPlatform], destIcons[curKey]);

                        grunt.file.copy(curSrc, curDest);
                        grunt.log.ok();
                    } catch (e) {
                        grunt.log.writeln(grunt.log.wordlist([
                            'FAILED'
                        ], {color: 'red'}));
                        grunt.log.error(e.message);
                        return;
                    }
                });
            };

        //icons is an optional parameter, lets check if it's even defined
        if (!settings.icons) {
            grunt.log.writeln('icons parameter not defined ... not copying icons!');
            return;
        }

        //if a platform was supplied, run copyIcons on specified platform
        //otherwise try copying the icons for all supported platforms
        if (platform) {
            copyIcons(platform);
        } else {
            //confirm the icon paths exist for defined platforms
            settings.platforms.forEach(function (curPlatform) {
                copyIcons(curPlatform);
            });
        }

        //we don't want failed attempts at copying icons to stop
        //the grunt process so we will just auto resolve and report
        //warnings to stdout
        defer.resolve();

        return defer.promise;
    }

    function updatePlistURLTypes(appId, urlScheme, pl) {
        //check for URL Types array
        if (!pl.CFBundleURLTypes) {
            pl.CFBundleURLTypes = [];
        }

        //now insert into plist object
        pl.CFBundleURLTypes[0] = {
            CFBundleURLName: appId,
            CFBundleURLSchemes: [ urlScheme ]
        };

        return pl;
    }

    function updatePlist(settings) {
        var defer = q.defer(),
            plistPath = path.resolve(
                settings.basePath,
                'platforms',
                'ios',
                settings.appName,
                settings.appName + '-Info.plist'
            ),
            plistObj;
        if (!grunt.file.exists(plistPath)) {
            grunt.log.error(['Failed to find plist file for phonegap project.'],
                            ['Skipping plist update.'].join(' '));
            defer.resolve();
            return;
        }

        plistObj = plist.parse(grunt.file.read(plistPath, {encoding: 'utf8'}));

        //if the appUrlScheme is defined, update the plist file to include changes
        if (settings.appUrlScheme) {
            plistObj =
                updatePlistURLTypes(settings.appId, settings.appUrlScheme, plistObj);

            grunt.file.write(plistPath, plist.build(plistObj), {encoding: 'utf8'});
        }

        defer.resolve();
        return defer.promise;
    }

    function spawnCmd(cmdOptions) {
        var defer = q.defer(),
            cmd;

        cmd = grunt.util.spawn(cmdOptions, function (error, result, code) {
            if (error) {
                defer.reject(error.message);
            } else {
                defer.resolve();
            }
        });

        cmd.stderr.on('data', function (data) {
            grunt.log.write(data);
        });

        cmd.stdout.on('data', function (data) {
            grunt.log.write(data);
        });

        return defer.promise;
    }

    function phonegapCreate(s) {
        var defer = q.defer(),
            appPath = path.resolve(s.basePath),
            //generate phonegap config based off of provided settings
            platformsObj = s.platforms.reduce(function (prev, cur) {
                prev.lib[cur] = {
                    url: path.resolve(s.templates[cur])
                };

                return prev;
            }, {
                lib: {
                    www: {
                        url: path.resolve(s.templates.www)
                    }
                }
            }),
            cmdOptions = {
                cmd: s.command,
                args: [
                    'create',
                    appPath,
                    s.appId,
                    s.appName,
                    JSON.stringify(platformsObj)
                ]
            };

        if (grunt.file.exists(s.basePath)) {
            grunt.log.writeln('The phonegap path already exists, skipping create process');
            defer.resolve();
            return defer.promise;
        }

        spawnCmd(cmdOptions).then(function () {
            defer.resolve();
        }, function (err) {
            defer.reject(err);
        });

        return defer.promise;
    }

    function phonegapAdd(s, platform) {
        var defer = q.defer(),
            appPath = path.resolve(s.basePath),
            cmdOptions = {
                cmd: s.command,
                opts: {
                    cwd: appPath
                },
                args: [
                    'platform',
                    'add',
                    platform
                ]
            },
            platformPath;

        //check if platform parameter was supplied
        if (!platform) {
            grunt.fail.fatal('The platform argument was not supplied!');
        }

        //make sure app path exists
        if (!grunt.file.exists(appPath)) {
            grunt.fail.fatal('Phonegap project does not exist, run create!');
        }

        //confirm that the supplied platform exists
        if (!s.templates[platform]) {
            grunt.fail.fatal('No corresponding template exists for ' + platform);
        }

        //before we add the platform, lets see if it already extists
        platformPath = path.resolve(s.basePath, 'platforms', platform);
        if (grunt.file.exists(platformPath)) {
            grunt.log.writeln('Platform for ' + platform + ' already exists, not adding.');
            defer.resolve();
            return defer.promise;
        }

        spawnCmd(cmdOptions).then(function () {
            //update the created plist file
            updatePlist(s).then(function () {
                return phonegapCopyIcons(s, platform);
            }).then(function () {
                defer.resolve();
            }, function (err) {
                console.log("oh no! " + err);
                defer.reject(err);
            });
        }, function (err) {
            defer.reject(err);
        });

        return defer.promise;
    }

    function phonegapPrepare(s, platform) {
        var defer = q.defer(),
            appPath = path.resolve(s.basePath),
            cmdOptions = {
                cmd: s.command,
                opts: {
                    cwd: appPath
                },
                args: [
                    'prepare'
                ]
            },
            platformPath;

        //make sure app path exists
        if (!grunt.file.exists(appPath)) {
            grunt.fail.fatal('Phonegap project does not exist, run create!');
        }

        //add specific platform target if supplied
        if (platform) {
            //confirm that the supplied platform exists
            if (!s.templates[platform]) {
                grunt.fail.fatal('No corresponding template exists for ' + platform);
            }

            cmdOptions.args.push(platform);
        }

        spawnCmd(cmdOptions).then(function () {
            defer.resolve();
        }, function (err) {
            defer.reject(err);
        });

        return defer.promise;
    }

    function phonegapBuild(s, platform) {
        var defer = q.defer(),
            appPath = path.resolve(s.basePath),
            cmdOptions = {
                cmd: s.command,
                opts: {
                    cwd: appPath
                },
                args: [
                    'build'
                ]
            },
            platformPath;

        //build specific platform target if supplied
        if (platform) {
            //confirm that the supplied platform exists
            if (!s.templates[platform]) {
                grunt.fail.fatal('No corresponding template exists for ' + platform);
            }

            cmdOptions.args.push(platform);
        }

        //make sure app path exists
        if (!grunt.file.exists(appPath)) {
            grunt.fail.fatal('Phonegap project does not exist, run create!');
        }

        spawnCmd(cmdOptions).then(function () {
            defer.resolve();
        }, function (err) {
            defer.reject(err);
        });

        return defer.promise;
    }

    function phonegapAddPlugins(s) {
        var defer = q.defer(),
            appPath = path.resolve(s.basePath),
            cmdOptions = {
                cmd: s.command,
                opts: {
                    cwd: appPath
                },
                args: [
                    'plugin',
                    'add'
                ]
            },
            buildProject = phonegapBuild.bind(null, s),
            p;

        //check if plugins parameter was supplied
        if (!s.plugins || s.plugins.length === 0) {
            grunt.log.writeln('no plugins are defined ... skipping.');
            defer.resolve();
            return defer.promise;
        }

        //make sure app path exists
        if (!grunt.file.exists(appPath)) {
            grunt.fail.fatal('Phonegap project does not exist, run create!');
        }

        //run through each plugin and attempt to add it
        p = s.plugins.reduce(function (prevP, curVal) {
            return prevP.then(function () {
                var customOpts = _.clone(cmdOptions);
                customOpts.args.push(path.resolve(curVal));
                return spawnCmd(customOpts);
            });
        }, q());


        p.then(buildProject)
            .then(function () {
                defer.resolve();
            }, function (err) {
                defer.reject(err);
            });

        return defer.promise;
    }

    function phonegapPackagingIos(s) {
        var defer = q.defer(),
            appPath = path.resolve(s.basePath),
            projectPath = path.resolve(
                s.basePath,
                'platforms',
                'ios',
                s.appName + '.xcodeproj'
            ),
            archiveOutputFile = path.resolve(
                s.outputPath,
                s.appName + '.xcarchive'
            ),
            ipaOutputFile = path.resolve(
                s.outputPath,
                s.appName + '.ipa'
            ),
            ipaArchiveCmdOptions = {
                cmd: 'xcodebuild',
                opts: {
                    cwd: appPath
                },
                args: [
                    '-scheme',
                    s.appName,
                    '-project',
                    projectPath,
                    'archive',
                    '-archivePath',
                    archiveOutputFile
                ]
            },
            ipaPackageCmdOptions = {
                cmd: 'xcodebuild',
                opts: {
                    cwd: appPath
                },
                args: [
                    '-exportArchive',
                    '-exportFormat',
                    'ipa',
                    '-archivePath',
                    archiveOutputFile,
                    '-exportPath',
                    ipaOutputFile,
                    '-exportProvisioningProfile',
                    s.packaging.ios.provisioningProfileName
                ]
            },
            removeIpa = function () {
                var d = q.defer();

                if (fs.existsSync(ipaOutputFile)) {
                    fs.remove(ipaOutputFile, function (err) {
                        if (err) {
                            d.reject(err);
                        } else {
                            d.resolve();
                        }
                    });
                } else {
                    d.resolve();
                }

                return d.promise;
            },
            removeArchive = function () {
                //when we're done we want to remove the .xcarchive file
                var d = q.defer();

                fs.remove(archiveOutputFile, function (err) {
                    if (err) {
                        d.reject(err);
                    } else {
                        d.resolve();
                    }
                });

                return d.promise;
            },
            runIpaArchive,
            runIpaPackage;

        //check the packaging section for optional code sign setting
        if (s.packaging.ios.codeSignIdentity) {
            //add signing identity override as a command line argument
            ipaArchiveCmdOptions.args.push(
                'CODE_SIGN_IDENTITY="' +
                    s.packaging.ios.codeSignIdentity + '"'
            );
        }

        //check the packaging section for optional provisioning profile setting
        if (s.packaging.ios.provisioningProfileUUID) {
            //add provisioning profile override as a command line argument
            ipaArchiveCmdOptions.args.push(
                'PROVISIONING_PROFILE=' +
                    s.packaging.ios.provisioningProfileUUID
            );
        }

        //bind arguments to spawnCmd to make
        //the promise chaining more readable
        runIpaArchive = spawnCmd.bind(null, ipaArchiveCmdOptions);
        runIpaPackage = spawnCmd.bind(null, ipaPackageCmdOptions);

        return removeIpa()
            .then(runIpaArchive)
            .then(runIpaPackage)
            .then(removeArchive);
    }

    function phonegapPackage(s, platform) {
        var defer = q.defer(),
            appPath = path.resolve(s.basePath),
            platforms = s.platforms,
            p = q();

        //check if we should package for a particular platform
        if (platform) {
            //confirm that the supplied platform exists
            if (!s.templates[platform]) {
                grunt.fail.fatal('No corresponding template exists for ' + platform);
            }

            platforms = [ platform ];
        }

        //make sure app path exists
        if (!grunt.file.exists(appPath)) {
            grunt.fail.fatal('Phonegap project does not exist, run create!');
        }

        //confirm packaging settings were defined
        if (!s.packaging) {
            grunt.fail.fatal('Packaging settings were not defined!');
        }

        //confirm an output path is defined in the settings
        if (!s.outputPath) {
            grunt.fail.fatal('The outputPath setting must be defined!');
        }

        platforms.forEach(function (curPlatform) {
            //confirm that the supplied platform packaging settings exists
            if (!s.packaging[curPlatform]) {
                grunt.fail.fatal('Packaging settings were not defined for ' + curPlatform);
            }

            //currently only ios supported
            switch (curPlatform) {
            case 'ios':
                if (!s.packaging[curPlatform].provisioningProfileName) {
                    grunt.fail.fatal('provisioningProfileName must be defined ' +
                                     'for ios packaging settings');
                } else {
                    p = p.then(function () {
                        return phonegapPackagingIos(s);
                    });
                }
                break;
            }
        });

        p.then(function () {
            defer.resolve();
        }, function (err) {
            defer.reject(err);
        });

        return defer.promise;
    }

    grunt.task.registerTask('phonegap_offline', description, function (action, platform) {
        var done,
            settings,
            platformCheck,
            templatesCheck,
            actions = {
                create: function (s) {
                    return phonegapCreate(s);
                },
                add: function (s, platform) {
                    return phonegapAdd(s, platform);
                },
                prepare: function (s, platform) {
                    return phonegapPrepare(s, platform);
                },
                icons: function (s, platform) {
                    return phonegapCopyIcons(s, platform);
                },
                plugins: function (s) {
                    return phonegapAddPlugins(s);
                },
                "package": function (s, platform) {
                    return phonegapPackage(s, platform);
                },
                build: function (s, platform) {
                    return phonegapBuild(s, platform);
                }
            };

        //settings must be defined before we continue
        grunt.config.requires(settingsKey);

        //platforms and templates are also required field
        grunt.config.requires(settingsKey + ".platforms");
        grunt.config.requires(settingsKey + ".templates");

        //retrieve settings and merge with defaults
        settings = grunt.config.get(settingsKey);
        settings = _.defaults(settings, settingsDefaults);
        grunt.config.merge({
            phonegap_offline: {
                settings: settings
            }
        });

        //check for valid supported platforms
        platformCheck = _.difference(settings.platforms, supportedPlatforms);

        if (platformCheck.length > 0) {
            grunt.fail.fatal('The ' +
                            platformCheck[0] +
                            ' platform is not supported!');
        }

        //check for required templates
        requiredTemplates.forEach(function (curTemplate) {
            var templatePath;

            if (!settings.templates[curTemplate]) {
                grunt.fail.fatal('The required template "' +
                                curTemplate +
                                '" was not defined!');
            }

            templatePath = path.resolve(settings.templates[curTemplate]);
            if (!grunt.file.exists(templatePath)) {
                grunt.fail.fatal('Invalid template path for ' + curTemplate +
                                 ': ' + templatePath);
            }
        });

        //check to make sure defined platforms have a corresponding template
        settings.platforms.forEach(function (curPlatform) {
            if (!settings.templates[curPlatform]) {
                grunt.fail.fatal('A template must be defined for the ' +
                                curPlatform + ' platform');
            }
        });

        //if no parameters were supplied set default action to create
        action = action || 'create';

        //check if action argument is valid
        if (actions[action]) {
            done = this.async();

            actions[action](settings, platform).then(function () {
                done();
            }, function (err) {
                grunt.fail.fatal(err);
                done(false);
            });
        } else {
            grunt.fail.fatal('Invalid action: "' + action + '"');
        }

    });

};
