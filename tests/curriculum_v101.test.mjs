import test from 'node:test';
import assert from 'node:assert/strict';
import {
  subjects, topics, groups, activeSubjects, activeTopics, activeGroups,
  isActiveSubject, isActiveTopic, displaySubjectName
} from '../curriculum.mjs';

const oldSubjectIds = ['math', 'linear', 'english', 'ds', 'co', 'os', 'net', 'politics'];
const math1SubjectIds = ['math1extra', 'probability'];
const english1SubjectId = 'english1extra';
const english2OnlyIds = ['english-2-2', 'english-3-2', 'english-4-2'];

test('1.0.0 目录的 ID 和默认数二英二视图保持稳定', () => {
  assert.deepEqual(subjects.slice(0, 8).map(subject => subject.id), oldSubjectIds);
  const oldTopics = subjects.slice(0, 8).flatMap(subject => subject.chapters.flatMap(chapter => chapter.topics));
  assert.equal(oldTopics.length, 209);
  assert.deepEqual(oldTopics.map(topic => topic.id), activeTopics({}).map(topic => topic.id));
  for (const id of ['math-0-0', 'math-4-6', 'linear-3-4', 'english-4-4', 'ds-5-10', 'co-5-3', 'os-4-2', 'net-4-3', 'politics-4-4']) {
    assert.ok(oldTopics.some(topic => topic.id === id), `${id} must remain available to migrated records`);
  }
  assert.deepEqual(activeSubjects({}).map(subject => subject.id), oldSubjectIds);
  assert.deepEqual(activeGroups({}), groups);
});

for (const mathExam of ['math1', 'math2']) {
  for (const englishExam of ['english1', 'english2']) {
    test(`${mathExam} × ${englishExam} 独立选择只展示对应范围`, () => {
      const settings = { mathExam, englishExam };
      const chosenSubjects = activeSubjects(settings);
      const ids = new Set(chosenSubjects.map(subject => subject.id));
      const chosenTopics = activeTopics(settings);
      const topicIds = new Set(chosenTopics.map(topic => topic.id));
      assert.equal(chosenTopics.length, topicIds.size);
      assert.equal(ids.has('math1extra'), mathExam === 'math1');
      assert.equal(ids.has('probability'), mathExam === 'math1');
      assert.equal(ids.has('english1extra'), englishExam === 'english1');
      assert.equal(activeGroups(settings).find(group => group.id === 'math').name, mathExam === 'math1' ? '数学一' : '数学二');
      assert.equal(activeGroups(settings).find(group => group.id === 'english').name, englishExam === 'english1' ? '英语一' : '英语二');
      assert.equal(displaySubjectName('english', settings), englishExam === 'english1' ? '英语一 · 公共基础' : '英语二');
      for (const subjectId of math1SubjectIds) assert.equal(isActiveSubject(settings, subjectId), mathExam === 'math1');
      assert.equal(isActiveSubject(settings, english1SubjectId), englishExam === 'english1');
      for (const id of english2OnlyIds) assert.equal(topicIds.has(id), englishExam === 'english2');
      assert.equal(topicIds.has('english-2-3'), true, 'shared heading-matching topic remains available');
      for (const subject of chosenSubjects) {
        for (const chapter of subject.chapters) {
          assert.ok(chapter.topics.length > 0);
          for (const topic of chapter.topics) {
            assert.ok(topicIds.has(topic.id));
            assert.equal(isActiveTopic(settings, topic), true);
          }
        }
      }
    });
  }
}

test('切换选考科目只改变视图，不删除另一个选项的知识点', () => {
  const allIds = new Set(topics.map(topic => topic.id));
  const math1Topic = subjects.find(subject => subject.id === 'probability').chapters[0].topics[0];
  const english1Topic = subjects.find(subject => subject.id === 'english1extra').chapters[0].topics[0];
  const english2Topic = topics.find(topic => topic.id === english2OnlyIds[0]);
  assert.equal(isActiveTopic({ mathExam: 'math2', englishExam: 'english2' }, math1Topic), false);
  assert.equal(isActiveTopic({ mathExam: 'math2', englishExam: 'english2' }, english1Topic), false);
  assert.equal(isActiveTopic({ mathExam: 'math1', englishExam: 'english1' }, english2Topic), false);
  assert.ok(allIds.has(math1Topic.id));
  assert.ok(allIds.has(english1Topic.id));
  assert.ok(allIds.has(english2Topic.id));
  assert.equal(new Set(topics.map(topic => topic.id)).size, topics.length);
});
