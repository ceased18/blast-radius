"""Optional SDK tests. Run using the Python environment with .[mcp] installed."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SDK_PRESENT = importlib.util.find_spec('mcp') is not None
ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(SDK_PRESENT, 'Optional official MCP SDK is not installed')
class MCPSnapshotTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_stdio_legacy_initialize_list_and_call(self):
        from mcp import Client, StdioServerParameters
        with tempfile.TemporaryDirectory() as directory:
            # The package and public pack must already be installed into this
            # test interpreter. No PYTHONPATH/cwd dependency is supplied.
            params = StdioServerParameters(command=sys.executable, args=['-m', 'blast', 'mcp'], cwd=directory)
            async with Client(params, mode='legacy') as client:
                self.assertIsNotNone(client.protocol_version)
                tools = await client.list_tools()
                self.assertEqual({t.name for t in tools.tools}, {'lookup_company', 'search_companies', 'snapshot_status'})
                for tool in tools.tools:
                    self.assertTrue(tool.annotations.read_only_hint)
                    self.assertFalse(tool.annotations.open_world_hint)
                known = await client.call_tool('lookup_company', {'domain': 'glean.com'})
                self.assertFalse(known.is_error)
                self.assertEqual(known.structured_content['domain'], 'glean.com')
                unknown = await client.call_tool('lookup_company', {'domain': 'example.com'})
                self.assertEqual(unknown.structured_content['record_status'], 'not_covered')
                search = await client.call_tool('search_companies', {'query': 'glean', 'limit': 1})
                self.assertEqual(search.structured_content['results'][0]['domain'], 'glean.com')
                status = await client.call_tool('snapshot_status', {})
                self.assertEqual(status.structured_content['account_count'], 6)
                self.assertFalse(status.structured_content['credentials_required'])

    def test_published_json_schema_validates_every_account(self):
        import jsonschema
        from blast.agent import Snapshot
        snapshot = Snapshot()
        schema = json.loads((snapshot.root / 'schemas/account.schema.json').read_text())
        for domain in snapshot.entries:
            jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker()).validate(snapshot.lookup(domain))
        unknown_schema = json.loads((snapshot.root / 'schemas/not-covered.schema.json').read_text())
        jsonschema.validate(snapshot.lookup('example.com'), unknown_schema)

    def test_installed_package_lookup_from_unrelated_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run([sys.executable, '-m', 'blast', 'lookup', 'glean.com'], cwd=directory, text=True, capture_output=True, check=True)
        self.assertEqual(json.loads(result.stdout)['domain'], 'glean.com')


if __name__ == '__main__':
    unittest.main()
