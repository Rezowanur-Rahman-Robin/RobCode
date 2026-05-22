import { TextAttributes } from "@opentui/core";
import { useTheme } from "../../providers/theme";
import { EmptyBorder } from "../border";

// ─── Types ───────────────────────────────────────────────────────────────────

type InlineSegment =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; url: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string };

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "code"; language: string; code: string }
  | { type: "text"; lines: InlineSegment[][] }
  | { type: "list"; items: InlineSegment[][]; ordered: boolean; start?: number }
  | { type: "blockquote"; segments: InlineSegment[] }
  | { type: "hr" }
  | { type: "empty" };

// ─── Inline Parser ───────────────────────────────────────────────────────────

function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let i = 0;

  while (i < text.length) {
    // Inline code: `text`
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        segments.push({ type: "code", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // Link: [text](url)
    if (text[i] === "[") {
      const closeBracket = text.indexOf("]", i + 1);
      if (
        closeBracket !== -1 &&
        text[closeBracket + 1] === "("
      ) {
        const closeParen = text.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          segments.push({
            type: "link",
            text: text.slice(i + 1, closeBracket),
            url: text.slice(closeBracket + 2, closeParen),
          });
          i = closeParen + 1;
          continue;
        }
      }
    }

    // Bold: **text**
    if (text[i] === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        segments.push({ type: "bold", text: text.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }

    // Italic: *text*  (but not ** which was handled above)
    if (text[i] === "*" && text[i + 1] !== "*") {
      const end = text.indexOf("*", i + 1);
      if (end !== -1) {
        segments.push({ type: "italic", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // Plain text – accumulate until the next special character
    let j = i;
    while (
      j < text.length &&
      text[j] !== "`" &&
      text[j] !== "[" &&
      text[j] !== "*"
    ) {
      j++;
    }
    if (j > i) {
      segments.push({ type: "text", text: text.slice(i, j) });
    }
    i = j;
  }

  return segments;
}

// ─── Block-Level Parser ──────────────────────────────────────────────────────

function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const lines = text.split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Empty / whitespace-only line
    if (line.trim() === "") {
      blocks.push({ type: "empty" });
      i++;
      continue;
    }

    // Fenced code block: ```language … ```
    if (line.trimStart().startsWith("```")) {
      const language = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trimStart().startsWith("```")) {
        codeLines.push(lines[i]!);
        i++;
      }
      // skip the closing ``` if present
      if (i < lines.length && lines[i]!.trimStart().startsWith("```")) {
        i++;
      }
      blocks.push({ type: "code", language, code: codeLines.join("\n") });
      continue;
    }

    // Heading: #, ##, ###, ####, #####, ######
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1]!.length,
        text: headingMatch[2]!,
      });
      i++;
      continue;
    }

    // Horizontal rule: ---, ***, ___
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Blockquote: > text
    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i]!.startsWith(">")) {
        quoteLines.push(lines[i]!.slice(1).trimStart());
        i++;
      }
      blocks.push({
        type: "blockquote",
        segments: parseInline(quoteLines.join(" ")),
      });
      continue;
    }

    // Unordered list: - item, * item, + item
    const ulMatch = line.match(/^[\s]*[-*+]\s+(.+)/);
    if (ulMatch) {
      const items: InlineSegment[][] = [];
      while (i < lines.length) {
        const m = lines[i]!.match(/^[\s]*[-*+]\s+(.+)/);
        if (!m) break;
        items.push(parseInline(m[1]!));
        i++;
      }
      blocks.push({ type: "list", items, ordered: false });
      continue;
    }

    // Ordered list: 1. item, 2. item
    const olMatch = line.match(/^[\s]*(\d+)\.\s+(.+)/);
    if (olMatch) {
      const items: InlineSegment[][] = [];
      const start = parseInt(olMatch[1]!, 10);
      while (i < lines.length) {
        const m = lines[i]!.match(/^[\s]*(\d+)\.\s+(.+)/);
        if (!m) break;
        items.push(parseInline(m[2]!));
        i++;
      }
      blocks.push({ type: "list", items, ordered: true, start });
      continue;
    }

    // Regular paragraph – consume consecutive text lines
    const textLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== "" &&
      !lines[i]!.trimStart().startsWith("```") &&
      !lines[i]!.startsWith("#") &&
      !lines[i]!.startsWith(">") &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i]!.trim()) &&
      !/^[\s]*[-*+]\s/.test(lines[i]!) &&
      !/^[\s]*\d+\.\s/.test(lines[i]!)
    ) {
      textLines.push(lines[i]!);
      i++;
    }

    if (textLines.length > 0) {
      blocks.push({
        type: "text",
        lines: textLines.map((l) => parseInline(l)),
      });
    }
  }

  return blocks;
}

// ─── Inline Renderer ─────────────────────────────────────────────────────────

function InlineText({ segments }: { segments: InlineSegment[] }) {
  const { colors } = useTheme();

  return (
    <box flexDirection="row">
      {segments.map((seg, idx) => {
        switch (seg.type) {
          case "text":
            return <text key={idx}>{seg.text}</text>;
          case "code":
            return (
              <text key={idx} fg={colors.info}>
                {seg.text}
              </text>
            );
          case "link":
            return (
              <text key={idx} fg={colors.info}>
                {seg.text}
              </text>
            );
          case "bold":
            return (
              <text key={idx} attributes={TextAttributes.BOLD}>
                {seg.text}
              </text>
            );
          case "italic":
            return (
              <text key={idx}>
                <em>{seg.text}</em>
              </text>
            );
          default:
            return null;
        }
      })}
    </box>
  );
}

// ─── Code Block ──────────────────────────────────────────────────────────────

const CODE_BORDER = {
  ...EmptyBorder,
  vertical: "│",
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
};

function CodeBlockView({ language, code }: { language: string; code: string }) {
  const { colors } = useTheme();
  const lines = code.split("\n");
  const showLineNumbers = lines.length > 1;

  return (
    <box width="100%" paddingTop={1}>
      {/* Top border row with language label */}
      <box
  border={["top", "left", "right"]}
  borderColor={colors.thinkingBorder}
  backgroundColor={colors.surface}
  customBorderChars={CODE_BORDER}
  paddingX={1}
  flexDirection="row"
  justifyContent="flex-end"
>


  {language ? (
    <text fg={colors.dimSeparator} attributes={TextAttributes.DIM}>
      {language}
    </text>
  ) : (
    <text> </text>
  )}
</box>

      {/* Code content */}
      <box
        border={["left", "right"]}
        borderColor={colors.thinkingBorder}
        backgroundColor={colors.surface}
        customBorderChars={CODE_BORDER}
        paddingX={1}
      >
        {lines.map((line, i) => (
          <box key={i} flexDirection="row">
            {showLineNumbers ? (
              <text
                fg={colors.dimSeparator}
                attributes={TextAttributes.DIM}
              >
                {String(i + 1).padStart(3, " ")}{" "}
              </text>
            ) : null}
            <text>{line || " "}</text>
          </box>
        ))}
      </box>

      {/* Bottom border row */}
      <box
        border={["bottom", "left", "right"]}
        borderColor={colors.thinkingBorder}
        backgroundColor={colors.surface}
        customBorderChars={CODE_BORDER}
      />
    </box>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

type MarkdownTextProps = {
  text: string;
  streaming?: boolean;
};

export function MarkdownText({ text, streaming = false }: MarkdownTextProps) {
  const { colors } = useTheme();

  // During streaming, partial markdown (unclosed code fences, half-written
  // lists) cannot be reliably parsed — render plain text until the stream
  // finishes so users can see every token as it arrives.
  if (streaming) {
    return (
      <box width="100%" flexDirection="column">
        {text.split("\n").map((line, i) => (
          <box key={i}>
            <text>{line || " "}</text>
          </box>
        ))}
      </box>
    );
  }

  const blocks = parseMarkdownBlocks(text);


  return (
    <box width="100%" flexDirection="column">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "empty":
            return <box key={i} height={1} />;

          case "heading": {
            return (
              <box key={i} paddingTop={block.level <= 2 ? 1 : 0} paddingBottom={0}>
                <text fg={colors.primary} attributes={TextAttributes.BOLD}>
                  {block.level === 1 ? "━ ".repeat(2) : ""}
                  {block.text}
                </text>
              </box>
            );
          }

          case "code":
            return (
              <CodeBlockView
                key={i}
                language={block.language}
                code={block.code}
              />
            );

          case "text":
            return (
              <box key={i} paddingY={0} flexDirection="column">
                {block.lines.map((segments, li) => (
                  <box key={li}>
                    <InlineText segments={segments} />
                  </box>
                ))}
              </box>
            );

          case "list":
            return (
              <box key={i} paddingLeft={2} paddingTop={0}>
                {block.items.map((item, itemIdx) => (
                  <box key={itemIdx} flexDirection="row" gap={1}>
                    <text
                      fg={colors.dimSeparator}
                      attributes={TextAttributes.DIM}
                    >
                      {block.ordered
                        ? `${(block.start ?? 1) + itemIdx}.`
                        : "•"}
                    </text>
                    <InlineText segments={item} />
                  </box>
                ))}
              </box>
            );

          case "blockquote":
            return (
              <box
                key={i}
                border={["left"]}
                borderColor={colors.thinkingBorder}
                customBorderChars={{
                  ...EmptyBorder,
                  vertical: "│",
                }}
                paddingLeft={1}
                width="100%"
              >
                <text attributes={TextAttributes.DIM}>
                  <InlineText segments={block.segments} />
                </text>
              </box>
            );

          case "hr":
            return (
              <box key={i} paddingY={0}>
                <text fg={colors.dimSeparator} attributes={TextAttributes.DIM}>
                  {"─".repeat(40)}
                </text>
              </box>
            );

          default:
            return null;
        }
      })}
    </box>
  );
}