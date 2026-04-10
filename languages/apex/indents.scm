; Apex indentation rules for Zed
;
; Indent any node that uses braces, parens, or brackets as delimiters.

(_ "{" "}" @end) @indent
(_ "(" ")" @end) @indent
(_ "[" "]" @end) @indent

; Multi-line expressions: assignments, method chains, field access
[
  (assignment_expression)
  (method_invocation)
  (field_access)
  (local_variable_declaration)
  (field_declaration)
] @indent

; Block comments
((block_comment) @indent
  (#match? @indent "^/\\*"))
