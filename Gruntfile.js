'use strict';

module.exports = function(grunt) {

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
      apidoc: {
        files: ['**/*.js', '*.js'],
        tasks: ['exec'],
        options: {
          interrupt: true,
          livereload: true,
        },
      },
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
      apidoc: {
        script: 'index.js',
        options: {
          ext: 'ini,js',
          ignore: ['**/*.js'],
          env: {
            NODE_ENV: 'dev',
          }
        }
      },
      dev: {
        script: 'index.js',
        options: {
          ext: 'ini,js',
          ignore: ['public/**/*.js'],
          env: {
            NODE_ENV: 'dev',
          }
        }
      },
      prod: {
        script: 'index.js',
        options: {
          ext: 'js,ini',
          ignore: ['public/**/*.js'],
          env: {
            NODE_ENV: 'prod',
          }
        }
      }
    },
    concurrent: {
      apidoc: {
        tasks: ['watch:apidoc', 'nodemon:apidoc'],
        options: {
          logConcurrentOutput: true
        }
      }
    },
    exec: {
      apidoc: {
        cmd: 'node_modules/apidoc/bin/apidoc -e node_modules/ -e public/ -o public/apidoc'
      },
      markdown: {
        cmd: 'node_modules/apidoc-markdown/index.js -o apidoc.md -p public/apidoc/'
      }
    },
  });

  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-env');
  grunt.loadNpmTasks('grunt-nodemon');
  grunt.loadNpmTasks('grunt-exec');
  grunt.loadNpmTasks('grunt-concurrent');

  grunt.registerTask('default', ['jshint', 'nodemon:dev']);
  grunt.registerTask('apidoc', ['concurrent:apidoc']);
};
