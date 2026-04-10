; Apex outline and symbol captures for Zed
;
; Only @definition.* captures are included — @reference.* captures for call
; sites and local variables produce too much noise in the Outline panel and
; symbol search without an LSP to make them actionable.

(class_declaration
  name: (identifier) @name) @definition.class

(interface_declaration
  name: (identifier) @name) @definition.interface

(enum_declaration
  name: (identifier) @name) @definition.enum

(enum_constant
  name: (identifier) @name) @definition.constant

(trigger_declaration
  name: (identifier) @name) @definition.type

(constructor_declaration
  name: (identifier) @name) @definition.method

(method_declaration
  name: (identifier) @name) @definition.method
