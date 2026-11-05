import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from blast.store import connect,put_account,insert_incident
from blast.collect import parse_feed
from blast.matching import evidence,classify,closest_provider
from blast.pipeline import duration,lint_copy,score,write,export
from blast.openrouter import reserve,BudgetStop

class EvidenceTests(unittest.TestCase):
    def test_alternates_are_not_causal(self):
        matches={m['provider_id']:m for m in evidence('OpenAI is experiencing an outage. Switch to Anthropic or Gemini as an alternative.')}
        self.assertEqual(matches['openai']['cause_status'],'provider_attributed')
        self.assertEqual(matches['anthropic']['cause_status'],'mitigation_mentioned')
        self.assertEqual(matches['google']['cause_status'],'mitigation_mentioned')

    def test_internal_routing_issue_not_upstream(self):
        matches=evidence('The routing issue was introduced in this morning’s deploy. Other providers were unaffected.','Voice Agent API: Google/Gemini LLM errors')
        self.assertFalse(any(m['cause_status']=='provider_attributed' for m in matches))

    def test_provider_picker_is_mention_only(self):
        self.assertEqual(evidence('Users cannot select Gemini or Anthropic in the model picker.')[0]['cause_status'],'provider_mentioned')

    def test_generic_cloud_not_llm_provider_evidence(self):
        self.assertEqual(evidence('Google Cloud Firebase networking is degraded.'),[])

    def test_one_provider_healthy_in_shared_sentence(self):
        matches={m['provider_id']:m for m in evidence('OpenAI is experiencing an outage while Anthropic models remain available.')}
        self.assertEqual(matches['openai']['cause_status'],'provider_attributed')
        self.assertEqual(matches['anthropic']['cause_status'],'unaffected')

    def test_deployed_workaround_is_not_internal_cause(self):
        match=evidence('OpenAI is experiencing an outage. Our team deployed a workaround.')[0]
        self.assertEqual(match['cause_status'],'provider_attributed')

    def test_hosted_models_not_direct_provider_blame(self):
        matches={m['provider_id']:m for m in evidence('AWS Bedrock is experiencing errors for OpenAI models. OpenAI direct requests remain healthy.')}
        self.assertNotEqual(matches['openai']['cause_status'],'provider_attributed')

    def test_feed_dates_are_not_onset(self):
        rss='<rss><channel><item><title>OpenAI outage</title><link>https://status.example.com/a</link><pubDate>Thu, 05 Nov 2026 12:00:00 GMT</pubDate><description>Resolved</description></item></channel></rss>'
        parsed=parse_feed(rss,'https://status.example.com/history.rss')[0]
        self.assertIsNone(parsed['resolved_at']);self.assertIn('publication',parsed['timestamp_basis'])

    def test_unknown_negative_duration(self):
        self.assertIsNone(duration('2026-11-05T12:00:00+00:00',None))
        self.assertIsNone(duration('2026-11-05T12:00:00+00:00','2026-11-05T11:00:00+00:00'))

    def test_copy_rules_and_architecture(self):
        self.assertIn('unsupported architecture assertion',lint_copy('You have no failover.'))
        self.assertIn('link',lint_copy('See https://example.com'))
        self.assertIn('threaded reply subject must be empty',lint_copy('Question?','new subject',2))
        self.assertIn('unsupported architecture assertion',lint_copy('Your architecture lacks automatic fallback handling.'))
        self.assertIn('one ask per message',lint_copy('Who owns it? When will you change?'))
        self.assertIn('literal newline escape; use real line breaks',lint_copy('First sentence.\\nSecond sentence.'))

class StoredPipelineTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.dbpath=self.root/'test.db'
        self.db=connect(self.dbpath)
        self.aid=put_account(self.db,'Named Private Company','private-example.com','https://status.private-example.com')
    def tearDown(self):self.db.close();self.tmp.cleanup()

    def incident(self,**kw):
        inc={'title':'OpenAI outage','url':'https://status.private-example.com/incidents/one','started_at':'2026-11-05T12:00:00+00:00','body':'OpenAI is experiencing an outage.','source_verified':True,'classification':'provider_attributed','provider':'openai','quote':'OpenAI is experiencing an outage.','timestamp_basis':'explicit_impact_window'}|kw
        return insert_incident(self.db,inc,account_id=self.aid)

    def test_url_dedupe_and_classify_executes(self):
        first=self.incident(id='provider-id');second=self.incident(id='research-import')
        self.assertEqual(first,second);classify(self.dbpath)
        self.assertEqual(self.db.execute('select count(*) from matches').fetchone()[0],1)

    def test_reviewed_title_and_context_survive_feed_refresh(self):
        iid=self.incident(title='Reviewed source title')
        self.incident(title='Unreviewed feed title',source_verified=False)
        row=self.db.execute('select title,raw from incidents where id=?',(iid,)).fetchone()
        self.assertEqual(row['title'],'Reviewed source title');self.assertTrue(json.loads(row['raw'])['source_verified'])

    def test_documented_routing_can_suppress_generic_pitch(self):
        self.incident();classify(self.dbpath)
        payload={'qualification':{'disposition':'exclude_generic_fallback_campaign','outreach_guidance':'Documented native routing; validate a different use case.'}}
        self.db.execute('update accounts set payload=?',(json.dumps(payload),));self.db.commit()
        score(self.dbpath);write(self.dbpath)
        result=json.loads(self.db.execute('select payload from accounts').fetchone()[0])
        self.assertEqual(result['score'],0);self.assertEqual(result['outreach']['emails'],[])

    def test_reviewed_warning_not_upgraded(self):
        self.incident(classification='provider_warning');classify(self.dbpath);score(self.dbpath)
        payload=json.loads(self.db.execute('select payload from accounts').fetchone()[0])
        self.assertEqual(payload['attributed_incident_count'],0)

    def test_null_start_survives_and_never_gets_lag(self):
        self.incident(started_at=None);classify(self.dbpath);score(self.dbpath)
        payload=json.loads(self.db.execute('select payload from accounts').fetchone()[0])
        self.assertEqual(payload['incidents_90d'],0);self.assertIsNone(payload['evidence'][0]['lag_minutes'])

    def test_public_export_is_physically_anonymous(self):
        self.incident();classify(self.dbpath);score(self.dbpath);write(self.dbpath)
        with patch('blast.pipeline.ROOT',self.root):
            export(self.dbpath);self.assertTrue((self.root/'site/public/data/private.json').exists())
            export(self.dbpath,public_only=True)
        public=(self.root/'site/public/data/public.json').read_text()
        self.assertNotIn('Named Private',public);self.assertNotIn('private-example',public)
        self.assertFalse((self.root/'site/public/data/private.json').exists())

    def test_budget_pending_unknown_and_exhaustion_fail_closed(self):
        with patch.dict(os.environ,{'BLAST_WEEKLY_BUDGET_USD':'0.05'}):
            rid=reserve(self.dbpath,'test',0.03,'model')
            with self.assertRaises(BudgetStop):reserve(self.dbpath,'test',0.01,'model')
            self.db.execute("update runs set status='complete',cost_usd=.03 where id=?",(rid,));self.db.commit()
            with self.assertRaises(BudgetStop):reserve(self.dbpath,'test',0.03,'model')
            self.db.execute("update runs set status='unknown_cost' where id=?",(rid,));self.db.commit()
            with self.assertRaises(BudgetStop):reserve(self.dbpath,'test',0.001,'model')

    def test_old_unknown_spend_blocks_new_week(self):
        with patch.dict(os.environ,{'BLAST_WEEKLY_BUDGET_USD':'0.05'}):
            rid=reserve(self.dbpath,'test',0.01,'model')
            self.db.execute("update runs set created_at='2020-01-01T00:00:00+00:00',status='unknown_cost' where id=?",(rid,));self.db.commit()
            with self.assertRaises(BudgetStop):reserve(self.dbpath,'test',0.001,'model')

    def test_negative_lag_is_temporal_not_causal(self):
        iid=self.incident(started_at='2026-11-05T11:50:00+00:00')
        pid=insert_incident(self.db,{'title':'Provider incident','url':'https://status.openai.com/incidents/a','started_at':'2026-11-05T12:00:00+00:00','body':''},kind='provider',provider_id='openai')
        inc=self.db.execute('select * from incidents where id=?',(iid,)).fetchone()
        providers=self.db.execute("select * from incidents where kind='provider'").fetchall()
        match,lag=closest_provider(inc,providers,'openai');self.assertEqual(match,pid);self.assertEqual(lag,-10)

if __name__=='__main__':unittest.main()
