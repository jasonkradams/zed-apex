; Apex folding rules for Zed

; Type declarations
(class_body) @fold
(interface_body) @fold
(enum_body) @fold

; Callable bodies
(constructor_body) @fold
(block) @fold
(accessor_declaration) @fold

; Triggers
(trigger_body) @fold

; Control flow
(switch_block) @fold

; Multi-line lists
(argument_list) @fold
(formal_parameters) @fold
(annotation_argument_list) @fold

; Inline SOQL/SOSL
(soql_query_body) @fold
(sosl_query_body) @fold

; Block comments
(block_comment) @fold
