'use strict';

module.exports = function(grunt) {
  var jasmine;

  grunt.initConfig({
    jshint: {
      options: {
        jshintrc: true,
      },
      files: {
        src: [
          '*.js',
          'providers/**/*.js',
          'rooms/**/*.js',
          'devices/**/*.js',
          'triggers/**/*.js',
        ]
      },
    },
    watch: {
      scripts: {
        files: [
          '*.js',
          'providers/**/*.js',
          'rooms/**/*.js',
          'devices/**/*.js',
          'triggers/**/*.js',
        ],
        tasks: ['jshint'],
        options: {
          livereload: true,
        }
      },
      static: {
        files: ['public/scripts/**/*.js'],
        tasks: ['jshint'],
        options: {
          livereload: false,
        }
      },
    },
    env: {
      dev: {
        NODE_ENV: 'dev',
      },
      prod: {
        NODE_ENV: 'prod',
      }
    },
    nodemon: {
      dev: {
        script: 'index.js',
        options: {
          ext: 'ini,js',
          env: {
            NODE_ENV: 'dev',
          }
        }
      },
      prod: {
        script: 'index.js',
        options: {
          ext: 'js,ini',
          ignore: ['public/**'],
          env: {
            NODE_ENV: 'prod',
          }
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-env');
  grunt.loadNpmTasks('grunt-nodemon');

  grunt.registerTask('jasmine', function () {
    if (jasmine) {
      jasmine.kill();
    }
    jasmine = grunt.util.spawn({
      cmd: 'jasmine-node',
      args: ['--verbose', 'specs']
    }, function() {
      console.log('Running Jasmine');
    });
    jasmine.stdout.pipe(process.stdout);
    jasmine.stderr.pipe(process.stderr);
    grunt.task.run('watch');
  });

  grunt.registerTask('default', ['jshint', 'nodemon:dev']);
};
