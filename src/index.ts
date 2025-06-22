import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPTransport } from '@hono/mcp'
import { Hono } from 'hono'


const app = new Hono()

// Your MCP server implementation
const mcpServer = new McpServer({
  name: 'my-mcp-server',
  version: '1.0.0',
})
mcpServer.registerTool("multiply",
  {
    description: "Multiply two numbers",
    inputSchema: { a: z.number(), b: z.number() }
  },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a * b) }]
  })
);

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.all('/mcp', async (c) => {
  const transport = new StreamableHTTPTransport()
  await mcpServer.connect(transport)
  return transport.handleRequest(c)
})

export default app