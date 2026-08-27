import { useEffect, useRef } from "react";
import Quill from "quill";
import "quill/dist/quill.snow.css";

/**
 * Quill 2 wrapped by hand rather than through react-quill, which does not
 * support React 19.
 *
 * The toolbar is deliberately narrower than Quill's default: it offers only
 * what Product::DESCRIPTION_TAGS allows through on the server, so the shop
 * never applies formatting that gets silently stripped on save.
 */
const TOOLBAR = [
  [{ header: [3, 4, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["blockquote", "link"],
  ["clean"],
];

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
}

export default function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  id,
  invalid = false,
}: RichTextEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  // Kept in a ref so the text-change handler never closes over a stale prop
  // while still being registered only once.
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;

  useEffect(() => {
    if (!hostRef.current || quillRef.current) return;

    const quill = new Quill(hostRef.current, {
      theme: "snow",
      placeholder,
      modules: { toolbar: TOOLBAR },
    });
    quillRef.current = quill;

    quill.on("text-change", () => {
      onChangeRef.current(quill.root.innerHTML);
    });
    quill.root.addEventListener("blur", () => onBlurRef.current?.());

    // Mounting with a value already set happens when editing an existing
    // product: the dialog renders once the record is in hand.
    if (value) {
      quill.clipboard.dangerouslyPasteHTML(value);
    }
    // `value` and `placeholder` are read once on purpose — this effect builds
    // the editor, and the effect below is what follows external changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow value changes that came from outside the editor (form.reset when the
  // dialog reopens on another product). Comparing first is what keeps the
  // caret from jumping to the end on every keystroke, since our own
  // text-change handler feeds the same value straight back as a prop.
  useEffect(() => {
    const quill = quillRef.current;
    if (!quill) return;

    const incoming = value || "";
    if (incoming === quill.root.innerHTML) return;

    if (incoming === "") {
      quill.setText("");
      return;
    }
    quill.clipboard.dangerouslyPasteHTML(incoming);
  }, [value]);

  return (
    <div
      id={id}
      data-invalid={invalid || undefined}
      className="rystore-rich-text overflow-hidden rounded-md border border-input bg-background data-[invalid]:border-destructive"
    >
      <div ref={hostRef} />
    </div>
  );
}
