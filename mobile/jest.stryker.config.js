/**
 * The tests' jest config as Stryker runs it (stryker.config.mjs): in Stryker's own process, so the
 * environment can tell it which test reached which mutant. jest.config.js's workerIdleMemoryLimit
 * makes jest run every file in a worker of its own, out of Stryker's sight; one file's own tests
 * hold far less than a worker's limit, so it is left out here. Stryker wraps the environment by
 * its path, read as written, so the path is whole rather than `<rootDir>`'s.
 */
const { join } = require('path');
const base = require('./jest.config.js');

const { workerIdleMemoryLimit: _inWorkers, coverageThreshold: _floors, ...config } = base;

module.exports = {
  ...config,
  testEnvironment: join(__dirname, 'test-utils', 'timerCheckingEnvironment.js'),
};
