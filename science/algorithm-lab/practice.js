/* Short, reproducible challenges for the concepts in Algorithm Lab. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AlgorithmPractice = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';

  // Every preset can be loaded into the sandbox to check the prediction.
  const questions = {
    sorting: [
      {
        id: 'sorting-bubble-pass', tag: 'BUBBLE SORT / ONE PASS',
        prompt: 'What does the array look like after one full pass?',
        context: 'Starting at the left, bubble sort compares each neighboring pair and swaps it if it is out of order.',
        visualLabel: 'STARTING ARRAY', visual: ['5', '1', '4', '2'],
        choices: ['1, 4, 2, 5', '1, 2, 4, 5', '5, 1, 4, 2', '2, 1, 4, 5'], answer: 0,
        hint: 'Follow the 5 as it is compared with each neighbor to its right.',
        explanation: 'The 5 swaps with 1, then 4, then 2. One pass puts the largest value at the end; it does not necessarily sort the whole array.',
        preset: { algorithm: 'bubble', values: [5, 1, 4, 2] }
      },
      {
        id: 'sorting-selection-pass', tag: 'SELECTION SORT / FIND THE MINIMUM',
        prompt: 'What is the array after selection sort places its first value?',
        context: 'Find the smallest value in the whole array and swap it into the first position.',
        visualLabel: 'STARTING ARRAY', visual: ['7', '2', '5', '1'],
        choices: ['2, 7, 5, 1', '1, 7, 2, 5', '1, 2, 5, 7', '7, 2, 5, 1'], answer: 2,
        hint: 'Which value is the smallest, and what was in the first position?',
        explanation: 'The minimum is 1. Swapping it with the first value, 7, gives 1, 2, 5, 7. Selection sort makes one swap here, not a series of adjacent swaps.',
        preset: { algorithm: 'selection', values: [7, 2, 5, 1] }
      },
      {
        id: 'sorting-insertion-prefix', tag: 'INSERTION SORT / GROW THE PREFIX',
        prompt: 'Where does 3 belong in the ordered prefix?',
        context: 'The first three values are already ordered. Insert the final value into that prefix.',
        visualLabel: 'ORDERED PREFIX  /  NEXT VALUE', visual: ['2', '5', '8', '|', '3'],
        choices: ['3, 2, 5, 8', '2, 5, 3, 8', '2, 5, 8, 3', '2, 3, 5, 8'], answer: 3,
        hint: 'Move 3 left past values larger than it, then stop.',
        explanation: 'The 3 moves left past 8 and 5, stopping after 2. The enlarged prefix is 2, 3, 5, 8.',
        preset: { algorithm: 'insertion', values: [2, 5, 8, 3] }
      },
      {
        id: 'sorting-merge-halves', tag: 'MERGE SORT / COMBINE TWO HALVES',
        prompt: 'What is copied back after merging these two halves?',
        context: 'The array started as 4, 1, 3, 2. Each half has been sorted; repeatedly take the smaller value from the fronts.',
        visualLabel: 'SORTED LEFT HALF  /  SORTED RIGHT HALF', visual: ['1', '4', '|', '2', '3'],
        choices: ['1, 2, 3, 4', '1, 4, 2, 3', '4, 3, 2, 1', '2, 3, 1, 4'], answer: 0,
        hint: 'Compare the first unchosen value in each half. What is the smallest available next?',
        explanation: 'Take 1, then 2, then 3, and finally the remaining 4. Merge sort copies the combined buffer back into the array.',
        preset: { algorithm: 'merge', values: [4, 1, 3, 2] }
      }
    ],
    pathfinding: [
      {
        id: 'path-clear-shortest', tag: 'BREADTH-FIRST SEARCH / SHORTEST ROUTE',
        prompt: 'How many moves are in a shortest route?',
        context: 'Start is in column 2 and the goal is in column 11 of the same row. There are no walls, and each move crosses one cell.',
        visualLabel: 'CLEAR ROW', visual: ['S: column 2', '→', 'G: column 11'],
        choices: ['8 moves', '9 moves', '10 moves', '18 moves'], answer: 1,
        hint: 'Moving directly along the row reaches the goal without a detour.',
        explanation: 'A straight route takes 9 moves. BFS explores in layers and finds a shortest route on an unweighted grid.',
        preset: { algorithm: 'bfs', walls: [] }
      },
      {
        id: 'path-bfs-frontier', tag: 'BREADTH-FIRST SEARCH / THE FRONTIER',
        prompt: 'Which structure lets BFS explore the oldest discovered cell next?',
        context: 'Discovered cells wait in a frontier until it is their turn to be visited.',
        visualLabel: 'DISCOVERED FIRST  →  DISCOVERED LAST', visual: ['A', 'B', 'C'],
        choices: ['A stack', 'A hash function', 'A queue', 'A sorted array'], answer: 2,
        hint: 'The first cell added should also be the first cell removed.',
        explanation: 'A queue is first in, first out. That lets BFS visit cells in distance layers. DFS instead uses a stack in this lab.',
        preset: { algorithm: 'bfs', walls: 'default' }
      },
      {
        id: 'path-trapped-start', tag: 'SEARCH / NO ROUTE',
        prompt: 'What happens when the start is surrounded by walls?',
        context: 'The start and goal are different cells. All four neighbors of the start are blocked.',
        visualLabel: 'THE START HAS NO OPEN NEIGHBORS', visual: ['wall', 'S', 'wall'],
        choices: ['The search passes through a wall', 'The search reports that no route exists', 'The search moves the goal', 'The search assumes start is the goal'], answer: 1,
        hint: 'After visiting the start, are there any cells left in the frontier?',
        explanation: 'There are no open neighbors to add. The frontier becomes empty and the search reports that no route exists.',
        preset: { algorithm: 'bfs', walls: [25, 36, 38, 49] }
      },
      {
        id: 'path-astar-priority', tag: 'A* SEARCH / CHOOSE A PRIORITY',
        prompt: 'What is the priority score for this cell?',
        context: 'On a clear row, this cell is 4 moves from the start and 5 moves from the goal. A* adds g (traveled) and h (estimated remaining).',
        visualLabel: 'A* PRIORITY', visual: ['g: 4', '+', 'h: 5', '=', '?'],
        choices: ['1', '5', '9', '20'], answer: 2,
        hint: 'Use f = g + h: add the distance traveled to the estimate.',
        explanation: 'The priority is f = 4 + 5 = 9. On this grid, h is the Manhattan distance to the goal, ignoring walls.',
        preset: { algorithm: 'astar', walls: [] }
      }
    ],
    binary: [
      {
        id: 'binary-discard-half', tag: 'BINARY SEARCH / DISCARD A HALF',
        prompt: 'After the first comparison, which values remain?',
        context: 'Look for 23 in this sorted array. The first middle value is 17.',
        visualLabel: 'SORTED ARRAY  /  TARGET 23', visual: ['3', '8', '12', '17', '23', '31', '40'],
        choices: ['3, 8, 12', '17, 23, 31, 40', '23, 31, 40', 'All seven values'], answer: 2,
        hint: 'The target is greater than 17. Can 17 or anything to its left still be the target?',
        explanation: 'Because 23 is greater than 17, the middle and everything to its left can be discarded. The remaining candidates are 23, 31 and 40.',
        preset: { values: [3, 8, 12, 17, 23, 31, 40], target: 23 }
      },
      {
        id: 'binary-empty-range', tag: 'BINARY SEARCH / MISSING VALUE',
        prompt: 'What does an empty search range tell you?',
        context: 'Search this sorted array for 11. Continue until there are no candidates left.',
        visualLabel: 'SORTED ARRAY  /  TARGET 11', visual: ['2', '6', '10', '14', '18'],
        choices: ['11 was found', '11 is not in the array', 'The array has been sorted', 'The search must start over'], answer: 1,
        hint: 'Each discarded value has already been ruled out.',
        explanation: 'When low passes high, no possible positions remain. Since no comparison matched 11, the correct result is not found.',
        preset: { values: [2, 6, 10, 14, 18], target: 11 }
      },
      {
        id: 'binary-middle-match', tag: 'BINARY SEARCH / FIRST COMPARISON',
        prompt: 'How many comparisons are needed to find 21?',
        context: 'The first comparison checks the middle of this seven-value sorted array.',
        visualLabel: 'SORTED ARRAY  /  TARGET 21', visual: ['4', '9', '15', '21', '28', '35', '41'],
        choices: ['1 comparison', '2 comparisons', '3 comparisons', '7 comparisons'], answer: 0,
        hint: 'Which value is exactly in the middle?',
        explanation: 'The middle value is 21, so the first comparison finds the target. Binary search does not always need its worst-case number of comparisons.',
        preset: { values: [4, 9, 15, 21, 28, 35, 41], target: 21 }
      }
    ],
    linear: [
      {
        id: 'linear-stack-pop', tag: 'STACK / LAST IN, FIRST OUT',
        prompt: 'Which item comes out with one pop?',
        context: 'A, then B, then C were pushed onto an empty stack. C is on top.',
        visualLabel: 'BOTTOM  →  TOP', visual: ['A', 'B', 'C'],
        choices: ['A', 'B', 'C', 'Nothing'], answer: 2,
        hint: 'A stack removes the most recently added item.',
        explanation: 'C was pushed last, so it is on top and comes out first. That is last in, first out (LIFO).',
        preset: { mode: 'stack', items: ['A', 'B', 'C'] }
      },
      {
        id: 'linear-queue-dequeue', tag: 'QUEUE / FIRST IN, FIRST OUT',
        prompt: 'Which item comes out with one dequeue?',
        context: 'A, then B, then C were added to an empty queue. A is at the front.',
        visualLabel: 'FRONT  →  BACK', visual: ['A', 'B', 'C'],
        choices: ['C', 'A', 'B', 'Nothing'], answer: 1,
        hint: 'A queue removes the item that has been waiting the longest.',
        explanation: 'A was added first, so it leaves first. That is first in, first out (FIFO).',
        preset: { mode: 'queue', items: ['A', 'B', 'C'] }
      },
      {
        id: 'linear-queue-sequence', tag: 'QUEUE / FOLLOW THE OPERATIONS',
        prompt: 'After adding D and removing two items, what is next out?',
        context: 'Start with the queue shown. Enqueue D, then dequeue twice. Peek at the front.',
        visualLabel: 'FRONT  →  BACK', visual: ['A', 'B', 'C'],
        choices: ['A', 'B', 'C', 'D'], answer: 2,
        hint: 'Adding D puts it at the back. Remove the two oldest items first.',
        explanation: 'The two dequeues remove A and B. C is now at the front, followed by D; peeking does not remove it.',
        preset: { mode: 'queue', items: ['A', 'B', 'C'], nextValue: 'D' }
      }
    ],
    recursion: [
      {
        id: 'recursion-four-factorial', tag: 'RECURSION / UNWIND THE CALLS',
        prompt: 'What value does 4! return?',
        context: 'Factorial multiplies each positive integer down to the base case, 0! = 1.',
        visualLabel: 'EXPAND THE CALL', visual: ['4', '×', '3', '×', '2', '×', '1'],
        choices: ['12', '10', '16', '24'], answer: 3,
        hint: 'Multiply 4 × 3 × 2 × 1.',
        explanation: 'Starting from 0! = 1, the calls return 1, 2, 6, and finally 24. Each waiting call multiplies by its own number.',
        preset: { n: 4 }
      },
      {
        id: 'recursion-base-case', tag: 'RECURSION / THE BASE CASE',
        prompt: 'What does the base case 0! return?',
        context: 'The factorial function stops calling itself once the input reaches zero.',
        visualLabel: 'STOPPING RULE', visual: ['0!', '=', '?'],
        choices: ['0', '1', 'It calls 0! again', 'There is no result'], answer: 1,
        hint: 'The base case supplies the value used to begin unwinding.',
        explanation: 'By definition, 0! = 1. Returning at the base case stops the chain of calls and gives the waiting calls a value to multiply.',
        preset: { n: 0 }
      },
      {
        id: 'recursion-stack-depth', tag: 'RECURSION / CALL STACK',
        prompt: 'How many calls are on the stack when 0! is called?',
        context: 'Start with 3!. Count the original call and the 0! call, before any call has returned.',
        visualLabel: 'CALLS WAITING TO RETURN', visual: ['3!', '2!', '1!', '0!'],
        choices: ['1', '3', '4', '0'], answer: 2,
        hint: 'Include both the original call and the base-case call.',
        explanation: 'The calls 3!, 2!, 1! and 0! are all on the stack at that moment: four frames in total.',
        preset: { n: 3 }
      }
    ],
    hashing: [
      {
        id: 'hash-wraparound', tag: 'HASH TABLE / LINEAR PROBING',
        prompt: 'Where will BA be inserted?',
        context: 'In this 11-slot table, AB occupies slot 10. BA hashes to the same slot; all other slots are empty.',
        visualLabel: 'END OF TABLE  →  WRAP TO START', visual: ['10: AB', '0: empty', '1: empty'],
        choices: ['Slot 10', 'Slot 0', 'Slot 1', 'There is no space'], answer: 1,
        hint: 'Linear probing checks the next slot and wraps around after slot 10.',
        explanation: 'BA collides with AB at slot 10. Linear probing wraps to slot 0, which is empty, so BA is inserted there.',
        preset: { insert: ['AB'], key: 'BA' }
      },
      {
        id: 'hash-tombstone', tag: 'HASH TABLE / DELETION',
        prompt: 'Can the table still find BA after AB is deleted?',
        context: 'AB was in slot 10 and BA was placed in slot 0. Deleting AB leaves a tombstone at slot 10.',
        visualLabel: 'PROBE SEQUENCE', visual: ['10: deleted', '0: BA'],
        choices: ['No, every deletion stops a search', 'Yes, search continues to slot 0', 'No, BA is deleted too', 'Only if BA is reinserted'], answer: 1,
        hint: 'A tombstone is different from a slot that has never been used.',
        explanation: 'A tombstone preserves the probe chain. The lookup continues past slot 10 and finds BA in slot 0.',
        preset: { insert: ['AB', 'BA'], delete: ['AB'], key: 'BA' }
      },
      {
        id: 'hash-load-factor', tag: 'HASH TABLE / LOAD FACTOR',
        prompt: 'What is the table’s load factor?',
        context: 'Three of the eleven slots hold keys. Load factor is occupied slots divided by total slots.',
        visualLabel: 'OCCUPIED  /  CAPACITY', visual: ['3 keys', '11 slots'],
        choices: ['11 / 3', '3 / 8', '8 / 11', '3 / 11'], answer: 3,
        hint: 'Divide the number of occupied slots by the total capacity.',
        explanation: 'The load factor is 3 / 11, or about 0.27. As a table fills, collisions and probe lengths can increase.',
        preset: { insert: ['CAT', 'DOG', 'AB'], key: 'BA' }
      }
    ]
  };

  const topicOrder = Object.keys(questions);
  const totalQuestions = topicOrder.reduce((total, topic) => total + questions[topic].length, 0);
  return { questions, topicOrder, totalQuestions };
});
