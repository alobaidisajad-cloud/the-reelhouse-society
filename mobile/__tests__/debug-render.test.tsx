import { render, screen } from '@testing-library/react-native';
import { Text, View } from 'react-native';

describe('debug render', () => {
  it('shows what render returns', () => {
    const result = render(<View><Text>Hello</Text></View>);
    console.log('render result type:', typeof result);
    console.log('render result keys:', Object.keys(result));
    console.log('render result proto keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(result) || {}));
    console.log('typeof getByText:', typeof (result as any).getByText);
    console.log('result.constructor:', result?.constructor?.name);
    console.log('screen keys:', Object.keys(screen || {}));
    console.log('screen.getByText:', typeof screen?.getByText);
    expect(true).toBe(true);
  });
});
