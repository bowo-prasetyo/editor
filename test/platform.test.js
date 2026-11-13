// What this browser can do, said plainly (src/platform.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { browserName, downloadedMessage, downloadsNote } from '../src/platform.js'

const UA = {
  chrome: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1',
}

test('the browser is named for the notes, when it’s Firefox or Safari', () => {
  assert.equal(browserName(UA.firefox), 'Firefox')
  assert.equal(browserName(UA.safari), 'Safari')
  assert.equal(browserName(UA.chrome), 'this browser')
  assert.equal(browserName(UA.edge), 'this browser')
  assert.equal(browserName(UA.iosChrome), 'this browser')
  assert.equal(browserName(''), 'this browser')
})

test('the notes say what happens, and what to use instead', () => {
  assert.equal(downloadsNote(UA.firefox), 'In Firefox, Save downloads a copy. To save straight back to your files, use Chrome or Edge.')
  assert.equal(downloadsNote(''), 'In this browser, Save downloads a copy. To save straight back to your files, use Chrome or Edge.')
  assert.match(downloadedMessage('notes.md'), /“notes\.md”, to your downloads folder\. The file you opened isn’t changed\./)
})
