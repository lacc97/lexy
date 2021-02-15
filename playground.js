const api = "https://godbolt.org/api/";
const compiler = "clang_trunk";

export function list_of_productions(source)
{
    var result = [];

    const regex = /(struct|class) ([a-zA-Z0-9_]+)/g;
    var match = undefined;
    while (match = regex.exec(source))
        result.push(match[2]);

    return result;
}

export function preprocess_source(source, production)
{
    
    

    const macros = `#define LEXY_PLAYGROUND_PRODUCTION ${production}`
    return [macros, String.raw`#include <lexy/dsl.hpp>
namespace dsl = lexy::dsl;
#line 0 "grammar.cpp"
`, source, String.raw`#line 1 "playground.cpp"
#include <cctype>
#include <lexy/parse_tree.hpp>
#include <lexy_ext/cfile.hpp>
#include <lexy_ext/report_error.hpp>

template <typename Reader>
void* get_node_id(const lexy::parse_tree<Reader>&         tree,
                  typename lexy::parse_tree<Reader>::node node)
{
    using ptr_t = lexy::_detail::pt_node_ptr<Reader>;
    // It's okay to reinterpret standard layout type to first member.
    return reinterpret_cast<ptr_t*>(&node)->base();
}

int main()
{
    auto input = lexy_ext::read_file<lexy::utf8_encoding>(stdin).value();

    lexy::parse_tree_for<decltype(input)> tree;
    auto                                  result
        = lexy::parse_as_tree<LEXY_PLAYGROUND_PRODUCTION>(tree, input, lexy_ext::report_error);
    if (!result)
        return 1;

    std::puts("graph \"Parse Tree\" {");
    for (auto [event, node] : tree.traverse())
    {
        switch (event)
        {
        case lexy::traverse_event::enter:
            std::printf("\"node-%p\" [label=\"%.*s\"];\n", get_node_id(tree, node),
                        int(node.kind().name().size()), node.kind().name().data());
            break;

        case lexy::traverse_event::exit:
            // Now we can add all the connections.
            for (auto child : node.children())
                std::printf("\"node-%p\" -- \"node-%p\";\n", get_node_id(tree, node),
                            get_node_id(tree, child));
            break;

        case lexy::traverse_event::leaf:
            std::printf("\"node-%p\" [label=\"", get_node_id(tree, node));
            for (auto c : node.lexeme())
            {
                if (c == '"')
                    std::fputs(R"(\")", stdout);
                else if (c == ' ')
                    std::fputs("␣", stdout);
                else if (c == '\n')
                    std::fputs("⏎", stdout);
                else if (std::iscntrl(c))
                    std::printf("0x%02X", unsigned(c) & 0xFF);
                else
                    std::putchar(c);
            }
            std::puts("\", shape=box];");
            break;
        }
    }
    std::puts("}");
}

` ].join("\n");
}

export async function compile_and_run(source, input)
{
    var body = {};
    body.source = source;

    body.options = {};
    body.options.userArguments = "-fno-color-diagnostics -std=c++20";
    body.options.executeParameters = { args: [], stdin: input };
    body.options.compilerOptions = { executorRequest: true };
    body.options.filters = { execute: true };
    body.options.tools = [];
    body.options.libraries = [ { id: 'lexy', version: 'trunk' } ];

    body.lang = "c++";

    const response = await fetch(api + "compiler/" + compiler + "/compile", {
        method: "POST",
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body)
    });
    const result = await response.json();

    if (result.didExecute)
    {
        var stdout = result.stdout.map(x => x.text).join("\n");
        var stderr = result.stderr.map(x => x.text).join("\n");
        return { success: true, stdout: stdout, stderr: stderr, code: result.code };
    }
    else
    {
        var message = result.buildResult.stderr.map(x => x.text).join("\n");
        return { success: false, message: message };
    }
}

