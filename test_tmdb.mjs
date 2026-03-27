import 'dotenv/config'
const TMDB_API_KEY = process.env.VITE_TMDB_API_KEY;

async function test() {
  const params = {
    sort_by: 'popularity.desc',
    page: 1,
    'vote_count.gte': 20,
  };
  const qs = new URLSearchParams(params).toString();
  const url = 'https://api.themoviedb.org/3/discover/movie?' + qs + '&api_key=' + TMDB_API_KEY;
  console.log('Fetching:', url);
  const res = await fetch(url);
  console.log('Status:', res.status, res.statusText);
  if (!res.ok) {
    const text = await res.text();
    console.log('Error Body:', text);
  } else {
    const data = await res.json();
    console.log('Success, results:', data.results.length);
  }
}
test();
