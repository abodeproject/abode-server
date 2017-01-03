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
          'src/**/*.js',
        ]
      },
    },
    watch: {
      apidoc: {
        files: ['src/**/*.js'],
        tasks: ['exec'],
        options: {
          interrupt: true,
          livereload: false,
        },
      },
      scripts: {
        files: [
          'src/*.js',
          'src/**/*.js',
        ],
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
        script: 'src/index.js',
        options: {
          cwd: 'src',
          ext: 'ini,js',
          ignore: ['**/*.js'],
          env: {
            NODE_ENV: 'dev',
          }
        }
      },
      dev: {
        script: 'src/index.js',
        options: {
          cwd: 'src',
          ext: 'ini,js',
          env: {
            NODE_ENV: 'dev',
          }
        }
      },
      prod: {
        script: 'src/index.js',
        options: {
          cwd: 'src',
          ext: 'js,ini',
          env: {
            NODE_ENV: 'prod',
          }
        }
      }
    },
    concurrent: {
      dev: {
        tasks: ['watch:scripts', 'watch:static', 'nodemon:dev'],
        options: {
          logConcurrentOutput: true
        }
      },
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

  grunt.registerTask('default', ['jshint', 'concurrent:dev']);
  grunt.registerTask('apidoc', ['concurrent:apidoc']);
};
