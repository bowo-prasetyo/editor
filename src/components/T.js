import { h } from 'vue'
import { richText } from '../i18n'

// A message with a little markup (<strong>, <em>, <kbd>, <code>), rendered as
// elements and text, never as HTML:  <T k="home.welcome.files" :p="{ key }" />
export default {
  name: 'T',
  props: {
    k: { type: String, required: true },
    p: { type: Object, default: () => ({}) },
  },
  setup(props) {
    return () => richText(props.k, props.p).map((r) => (r.tag ? h(r.tag, r.text) : r.text))
  },
}
