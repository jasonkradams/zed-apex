// Apex highlights around an inline SOQL query.
// The brackets [ ] are punctuation in Apex; the SOQL body is not
// captured by Apex highlights — it is routed to the SOQL grammar
// via injections.scm.
// @inject soql_query_body SOQL
List<Account> accs = [SELECT Id, Name FROM Account WHERE Name = 'Acme' LIMIT 10];
/// <- variable
/// <- variable
///    <- operator
///     ^^^^^^^ variable
///            <- operator
///              ^^^^ variable
///                   <- operator
///                     <- punctuation
///                                                                ^^^^^^ string
///                                                                             ^^ number
///                                                                               <- punctuation
///                                                                                <- punctuation
