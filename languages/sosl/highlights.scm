;; SOSL Highlights — includes shared SOQL highlights + SOSL-specific

;; Header comments
(header_comment) @comment

;; --- SOQL shared highlights (SOSL embeds SOQL-style sub-queries) ---
(field_identifier (identifier) @property)
(field_identifier (dotted_identifier (identifier) @property))
(storage_identifier) @type
(_ function_name: (identifier) @function)
(date_literal) @constant.builtin
(date) @string.special
(date_time) @string.special
["," "." ":" "(" ")"] @punctuation
["AND" "OR" "NOT" "=" "!=" "LIKE" "NOT_IN" "INCLUDES" "EXCLUDES"] @operator
(value_comparison_operator "<" @operator)
"<=" @operator
(value_comparison_operator ">" @operator)
">=" @operator
(set_comparison_operator "IN" @operator)
(int) @number
(decimal) @number
(currency_literal) @number
(string_literal) @string
["TRUE" "FALSE" (null_literal)] @constant.builtin

;; --- SOSL-specific ---
(find_clause (term) @string)
(sobject_return (identifier) @type)
(with_type (_ "=" @operator))

["ALL" "DIVISION" "EMAIL" "FIND" "ListView" "HIGHLIGHT" "IN"
 "METADATA" "NAME" "NETWORK" "PHONE" "PricebookId" "RETURNING"
 "SIDEBAR" "SNIPPET" "SPELL_CORRECTION" "target_length" "USING"] @keyword
