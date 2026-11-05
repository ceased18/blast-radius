import io
import json
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError

from blast.pg_plan import PG_ENDPOINT, generate_pg_plan, prepare_pg_plan

ROOT = Path(__file__).resolve().parents[1]


class PGPreparationTests(unittest.TestCase):
    def test_prepare_is_a_read_only_research_brief_not_a_plan(self):
        with patch('blast.pg_plan.urlopen', side_effect=AssertionError('Network request')):
            result = prepare_pg_plan('glean.com')
        self.assertEqual(result['status'], 'prepared_not_researched')
        self.assertFalse(result['completed_research'])
        self.assertFalse(result['network_request_performed'])
        self.assertTrue(result['requires_live_research'])
        self.assertEqual(result['snapshot_context']['domain'], 'glean.com')
        self.assertEqual(result['required_output']['key_goal_for_week'], '')
        self.assertNotIn('pains', result)

    def test_unknown_accounts_and_custom_sellers_are_not_selected_or_enriched(self):
        result = prepare_pg_plan('example.com', 'Example Seller', 'seller.example')
        self.assertEqual(result['snapshot_context']['record_status'], 'not_covered')
        self.assertEqual(result['seller']['name'], 'Example Seller')
        self.assertEqual(result['public_api_request']['body']['account_domain'], 'example.com')
        for invalid in ['https://glean.com', 'user@glean.com', '../glean.com']:
            with self.assertRaises(ValueError): prepare_pg_plan(invalid)
        with self.assertRaises(ValueError): prepare_pg_plan('glean.com', 'Different Seller')
        with self.assertRaises(ValueError): prepare_pg_plan('glean.com', 'S' * 81, 'seller.example')

    def test_stdlib_dispatch_requires_no_model_or_collector_dependencies(self):
        result = subprocess.run([sys.executable, '-S', '-m', 'blast', 'prepare-pg-plan', 'glean.com'], cwd=ROOT, text=True, capture_output=True, check=True)
        self.assertEqual(json.loads(result.stdout)['status'], 'prepared_not_researched')

    def test_explicit_generation_uses_fixed_public_endpoint_no_visitor_key(self):
        class Response(io.BytesIO):
            status = 200
        payload = {'schema_version': '1.0', 'status': 'cached', 'plan': {'key_goal_for_week': ''}, 'usage': {'actual_cost_usd': 0}}
        with patch('blast.pg_plan.urlopen', return_value=Response(json.dumps(payload).encode())) as open_mock:
            result = generate_pg_plan('glean.com')
        request = open_mock.call_args.args[0]
        self.assertEqual(request.full_url, PG_ENDPOINT)
        self.assertEqual(request.method, 'POST')
        self.assertEqual(open_mock.call_args.kwargs['timeout'], 210)
        self.assertIsNone(request.get_header('Authorization'))
        self.assertEqual(json.loads(request.data)['account_domain'], 'glean.com')
        self.assertEqual(result['execution_route'], 'public_pg_api')
        self.assertEqual(result['status'], 'cached')

    def test_uncertain_sent_call_is_not_retried_or_claimed_as_a_plan(self):
        with patch('blast.pg_plan.urlopen', side_effect=URLError('timeout')) as open_mock:
            result = generate_pg_plan('glean.com')
        self.assertEqual(open_mock.call_count, 1)
        self.assertEqual(result['status'], 'transport_unavailable')
        self.assertNotIn('plan', result)

    def test_non_json_response_does_not_become_a_fake_success(self):
        class Response(io.BytesIO): status = 404
        with patch('blast.pg_plan.urlopen', return_value=Response(b'<html>Unavailable</html>')):
            result = generate_pg_plan('glean.com')
        self.assertEqual(result['status'], 'api_unavailable')
        self.assertNotIn('plan', result)


if __name__ == '__main__': unittest.main()
