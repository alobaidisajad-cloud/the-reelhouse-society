/**
 * Custom wrapper for @testing-library/react-native that makes `render` synchronous.
 *
 * In RNTL v14 with React 19, `render()` is async. This wrapper re-implements
 * render synchronously using React.act() and the same test-renderer.
 */
const path = require('path');
const actualPath = path.resolve(__dirname, '../node_modules/@testing-library/react-native/dist/index.js');
const actual = require(actualPath);

const React = require('react');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { testQueryClient } = require('./testQueryClient');
const { createRoot } = require('test-renderer');
const { getQueriesForInstance } = require(
  path.resolve(__dirname, '../node_modules/@testing-library/react-native/dist/within.js')
);
const { setRenderResult } = require(
  path.resolve(__dirname, '../node_modules/@testing-library/react-native/dist/screen.js')
);
const { addToCleanupQueue } = require(
  path.resolve(__dirname, '../node_modules/@testing-library/react-native/dist/cleanup.js')
);

// Synchronous render implementation
function renderSync(element, options = {}) {
  const { wrapper: Wrapper } = options || {};

  const rendererOptions = {
    textComponentTypes: ['Text', 'TextInput'],
    publicTextComponentTypes: ['Text'],
    transformHiddenInstanceProps: ({ props }) => ({
      ...props,
      style: props.style ? [props.style, { display: 'none' }] : { display: 'none' },
    }),
  };

  // The app's root layout holds every screen inside a query provider; so does
  // every render here, with the client every test builds (testQueryClient.ts:
  // the app's rules, no collection timer, errors heard). A test's own provider
  // sits inside this one, and wins; a test that mocks React Query away has said
  // how its queries answer, and gets none.
  const real = typeof QueryClient === 'function' && typeof QueryClientProvider === 'function';
  const client = real ? testQueryClient() : null;
  const wrap = (el) => {
    const inner = Wrapper ? React.createElement(Wrapper, null, el) : el;
    return client ? React.createElement(QueryClientProvider, { client }, inner) : inner;
  };
  const renderer = createRoot(rendererOptions);

  // Use React.act synchronously
  React.act(() => {
    renderer.render(wrap(element));
  });

  const unmount = () => {
    React.act(() => {
      renderer.unmount();
    });
  };

  const rerender = (component) => {
    React.act(() => {
      renderer.render(wrap(component));
    });
  };

  const toJSON = () => {
    const json = renderer.container.toJSON();
    if (json?.children?.length === 0) return null;
    if (json?.children?.length === 1 && typeof json.children[0] !== 'string') {
      return json.children[0];
    }
    return json;
  };

  addToCleanupQueue(unmount);

  const result = {
    ...getQueriesForInstance(renderer.container),
    rerender,
    unmount,
    toJSON,
    debug: (options) => {
      const json = renderer.container.toJSON();
      if (json) console.log(JSON.stringify(json, null, 2));
    },
    get container() { return renderer.container; },
    get root() {
      const firstChild = renderer.container.children[0];
      if (typeof firstChild === 'string') {
        throw new Error('Root element must be a host element.');
      }
      return firstChild;
    },
  };

  setRenderResult(result);
  return result;
}

module.exports = {
  ...actual,
  render: renderSync,
};
