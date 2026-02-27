import DOMPurify from 'dompurify';
import { marked } from 'marked';
console.log("DOMPurify:", typeof DOMPurify.sanitize);
console.log("marked:", typeof marked.parse);
