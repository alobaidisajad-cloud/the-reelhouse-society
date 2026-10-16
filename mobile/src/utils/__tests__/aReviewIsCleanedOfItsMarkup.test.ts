/**
 * aReviewIsCleanedOfItsMarkup.test.ts — stripHTML (utils/text.ts), the one cleaner a review passes
 * through wherever it is read: every tag it knows taken out by its name and only by its name, the
 * paragraph tags kept as line breaks, every entity it knows read, and nothing else touched.
 */
import { stripHTML } from '../text';

/** Every element the cleaner names, as text.ts lists them. */
const TAGS = [
  'p', 'div', 'br', 'hr', 'span', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'main',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'mark', 'small', 'big', 'sub', 'sup',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'a', 'blockquote', 'q', 'cite', 'abbr', 'address',
  'pre', 'code', 'kbd', 'samp', 'var', 'tt', 'font', 'center', 'time', 'wbr', 'bdi', 'bdo',
  'img', 'figure', 'figcaption', 'picture', 'source', 'video', 'audio', 'track', 'iframe', 'embed', 'object',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'col', 'colgroup',
  'details', 'summary', 'ruby', 'rt', 'rp', 'template', 'noscript', 'script', 'style',
  'form', 'input', 'button', 'select', 'option', 'textarea', 'label', 'fieldset', 'legend',
  'meta', 'link', 'html', 'head', 'body', 'title',
];
const BLOCKS = ['p', 'div', 'br'];

it('takes out every tag it names, opening and closing, with its attributes, and keeps the words between', () => {
  const wrong = TAGS.filter((t) => !BLOCKS.includes(t)).filter((t) => {
    const cleaned = [`<${t}>`, `<${t} class="x" data-a='1'>`, `<${t}/>`, `<${t} />`, `<${t.toUpperCase()}>`]
      .map((open) => stripHTML(`one ${open}two</${t}> three`));
    return cleaned.some((c) => c !== 'one two three');
  });
  expect(wrong).toEqual([]);
});

it('keeps every paragraph tag as a line break: opening, closing, alone, with attributes', () => {
  expect(stripHTML('<p>one</p><p>two</p>')).toBe('one\n\ntwo');
  expect(stripHTML('<div class="body">one</div>two')).toBe('one\ntwo');
  expect(stripHTML('one<br>two<br/>three<br />four<BR>five')).toBe('one\ntwo\nthree\nfour\nfive');
  expect(stripHTML('one<P STYLE="x">two')).toBe('one\ntwo');
});

it('takes a tag only by its whole name: a word in brackets is the member\'s own', () => {
  expect(stripHTML('<The Batman> is the best of them')).toBe('<The Batman> is the best of them');
  expect(stripHTML('<president> spoke, <pre>then</pre> <bravo> <divine> <spanking>')).toBe('<president> spoke, then <bravo> <divine> <spanking>');
  expect(stripHTML('a <b>bold</b> and <br>')).toBe('a bold and');
});

it('keeps angle brackets that name no element: a sum, an arrow, an empty pair', () => {
  expect(stripHTML('1 < 2 > 0')).toBe('1 < 2 > 0');
  expect(stripHTML('<> and </> and < / > and <3')).toBe('<> and </> and < / > and <3');
});

it('takes out every tag in the text, not the first alone', () => {
  expect(stripHTML('<em>a</em> <em>b</em> <strong>c</strong>')).toBe('a b c');
});

it('reads every entity it knows, whatever its case, and leaves any other as written', () => {
  expect(stripHTML('&quot;&apos;&#39;&amp;&lt;&gt;&nbsp;&mdash;&ndash;&hellip;&lsquo;&rsquo;&ldquo;&rdquo;'))
    .toBe('"\'\'&<> —–…‘’“”');
  expect(stripHTML('&QUOT;Quoted&Quot;')).toBe('"Quoted"');
  expect(stripHTML('&copy; &unknown; &#169; & alone ;')).toBe('&copy; &unknown; &#169; & alone ;');
});

it('reads an escaped entity once: &amp;lt; is the text &lt;, never a bracket', () => {
  expect(stripHTML('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
  expect(stripHTML('Tom &amp; Jerry &AMP; Co')).toBe('Tom & Jerry & Co');
});

it('trims the whole, and gives nothing for nothing', () => {
  expect(stripHTML('  <p> words </p>  ')).toBe('words');
  expect(stripHTML('')).toBe('');
  expect(stripHTML(null as unknown as string)).toBe('');
  expect(stripHTML(undefined as unknown as string)).toBe('');
});
