// Apex highlights around an inline SOSL query.
// The brackets [ ] are punctuation in Apex; the SOSL body is not
// captured by Apex highlights — it is routed to the SOSL grammar
// via injections.scm.
// Note: inline SOSL in Apex uses :variable bind syntax for the find term.
// @inject sosl_query_body SOSL
List<SObject> results = [FIND :term IN ALL FIELDS RETURNING Account(Id)];
/// <- variable
/// <- variable
///    <- operator
///     ^^^^^^^ variable
///            <- operator
///              ^^^^^^^ variable
///                      <- operator
///                        <- punctuation
///                               ^^^^ variable
///                                                                       <- punctuation
///                                                                        <- punctuation
