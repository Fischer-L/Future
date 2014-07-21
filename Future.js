/*	Func:
		Kind of like the JQuery's Deferreds. But with some extra funtions to track down the status of those deferred tasks, which is convinent for debugging.
	Properties:
		[ Public ]
		<NUM> FLAG_FUTURE_NOT_YET = The flag marking the future is not yet settled
		<NUM> FLAG_FUTURE_IS_OK = The flag marking the future is settled with the OK status
		<NUM> FLAG_FUTURE_IS_ERR = The flag marking the future is settled with the error status
		[ Private ]
		<CLS> _cls_Future_Queue_Ctrl = the controller to to control the jobs in the future obj's queue
		<CLS> _cls_Future = The so-called Future obj to defer and schedule the future jobs' execution after the prerequisite job ends, kind of like the jQuery's Deferred.
		<CLS> _cls_Future_Swear = The swear from one Future obj. We can use it to make the future obj swear to do sth after the future arrives. The swear obj has no right to settle the future so we can give it to outsiders. Let outsiders access the future obj without the ability to settle/interfere the future, kind of like jQuery's promise obj.
		<OBJ> _futures = the table to storing the future objs
	Methods:
		[ Private ]
		> _logErr : Log error
		> _define : Defined constant property on object
		[ Public ]
		> exist : Check if the specified Future obj is stored and made before.
		> newOne : New one Future obj. Future will also store the generated Future obj. Thus we would be able to call Future.dump to track every Future obj's status and prevent from generating two Future obj for the same thing.
		> rmOne : Remvoe one Future obj from Future's Future pool (Better remove after the future is settled so as to be able to track down unsettled future).
		> dump : Dump the array of names of Future objs. With the method, we could find out Future objs which are settled or not.
*/
var Future = (function () {
	/*	Properties:
			[ Private ]
			<ARR> __queueForOK = the queue of jobs to call on OK. Its type is DEFERRED_QUEUE_FOR_OK.
			<ARR> __queueForErr = the queue of jobs to call on error. Its type is DEFERRED_QUEUE_FOR_ERR.
		Methods:
			[ Public ]
			> setVarsForQueue : Set the vars to passed to the queued callbacks once they are invoked. Only can set one.
			> push : Add one job(callback) into the queue.
			> flush : Call the queued callbacks in the order they are pushed. After flushing the queue would be empty.
	*/
	function _cls_Future_Queue_Ctrl() {
		/*	Properties:
				[ Public ]
				<ARR> vars = the vars to passed to callbacks in this queue once they are invoked
		*/
		var __queueForOK = []; __queueForOK.vars = [];
		/*	Properties:
				[ Public ]
				<ARR> vars = the vars to passed to callbacks in this queue once they are invoked
		*/
		var __queueForErr = []; __queueForErr.vars = [];
		/*	Arg:
				<STR> queueType = the queue type
				<ARR> vars = the vars to passed to the queued callbacks once they are invoked
			Return:
				@ OK: true
				@ NG: false
		*/
		this.setVarsForQueue = function (queueType, vars) {
			var queue = (queueType == "DEFERRED_QUEUE_FOR_OK") ? __queueForOK : (queueType == "DEFERRED_QUEUE_FOR_ERR") ? __queueForErr : null;
			if (queue) {
				if (queue.vars.length <= 0 && vars instanceof Array) {
					queue.vars = vars.slice(0);
					return true;
				}
			}
			return false;
		}
		/*	Arg:
				<STR> queueType = the queue type
				<FN|ARR> callbacks = the function to push, if multiple put in one array
			Return:
				<NUM> the numbers of jobs queued
		*/
		this.push = function (queueType, callbacks) {
			var queue = (queueType == "DEFERRED_QUEUE_FOR_OK") ? __queueForOK : (queueType == "DEFERRED_QUEUE_FOR_ERR") ? __queueForErr : null,
				callbacksArray = (callbacks instanceof Array) ? callbacks : [callbacks],
				callback;
			
			if (queue) {
				callback = callbacksArray.shift();
				while (typeof callback == "function") {
					queue.push(callback);
					callback = callbacksArray.shift();
				}
			}
			
			return queue.length;
		}
		/*	Arg:
				<STR> queueType = the type of queue to flush
		*/
		this.flush = function (queueType) {
			var queue = (queueType == "DEFERRED_QUEUE_FOR_OK") ? __queueForOK : (queueType == "DEFERRED_QUEUE_FOR_ERR") ? __queueForErr : null;
			if (queue) {
				var callback = queue.shift();
				while (typeof callback == "function") {
					callback.apply(null, queue.vars);
					callback = queue.shift();
				}
			}
		}
	}
	/*	Properties:
			[ Private ]
			<STR> __name = the name of this future obj
			<NUM> __andThenCount = the counts how many this.andThen call
			<STR> __status = the stauts, could be
							 @ The prerequsite job is done successfully: Future.FLAG_FUTURE_IS_OK
							 @ The prerequsite job is done unsuccessfully: Future.FLAG_FUTURE_IS_ERR
							 @ The prerequsite job is done not yet: Future.FLAG_FUTURE_NOT_YET
			<OBJ> __queueCtrl = the controller to control the jobs deferred into the future, the instance of Future::_cls_Future_Queue_Ctrl
		Methods:
			[ Private ]
			> __flushQueue : Call this::__queueCtrl to flush the corresponding jobs deferred into the future if this future is settled. Do not call this::__queueCtrl directly to flush, instead, use this method to prevent from flushing the job queue while the future is not yet settled.
			[ Public ]
			> getName : Get the name of future
			> report : Report the future obj status
			> next : Add one job and execute the job once the future status is settled with OK, kind of like jQuery's done
			> fall : Add one job and execute the job once the future status is settled with error, kind of like jQuery's fail
			> andThen : Add jobs and execute the jobs once the future status is settled.
						Calling this method gives us a chance to make the jobs after this method chained to another future/swear obj.
						According to the returned value of the called callback, there could be four cases:
						- Case 1: the and-then callback returns one future or one swear obj different from the original one so the future jobs chained after this andThen call would be tied to this new successor future/swear obj and the arguments for jobs in the successor's queue would depend on the successor's arguments settled with.
						- Case 2: the and-then callback returns the original future obj so the successor would be the original one still and the arguments for jobs in the successor's queue would be arguments passed along the original one's queue.
						- Case 3: the and-then callbacks returns anything but future obj so the successor would be the original one still and the returned value would be the arguments for jobs in the successor's queue.
						- Case 4: No and-then callbacks could be called so the successor would be the original one still and the arguments for jobs in the successor's queue would be arguments passed along the original one's queue.
						This method is kind of like jQuery's then.
			> approve : Approve the future. This is to settle the future with the OK status
			> disapprove : Disapprove the future. This is to settle the future with the Error status
			> swear : Get the swear obj assocciated with this future obj
	------------------------------------------------------------------------------------------------
		Arg:
			<STR> name = the name of the future obj
	*/
	function _cls_Future(name) {
		var __name = name;
		var __andThenCount = 0;
		var __status = Future.FLAG_FUTURE_NOT_YET;
		var __queueCtrl = new _cls_Future_Queue_Ctrl;
		/*
		*/
		function __flushQueue() {
			if (Future.FLAG_FUTURE_IS_OK === __status) {			
				__queueCtrl.flush("DEFERRED_QUEUE_FOR_OK");				
			} else if (Future.FLAG_FUTURE_IS_ERR === __status) {			
				__queueCtrl.flush("DEFERRED_QUEUE_FOR_ERR");
			}
		}
		/*	Return:
				<STR> the name of future
		*/
		this.getName = function () {
			return __name;
		}
		/*	Return: Refer to Private::__status
		*/
		this.report = function () {
			if (   __status !== Future.FLAG_FUTURE_NOT_YET
				&& __status !== Future.FLAG_FUTURE_IS_OK
				&& __status !== Future.FLAG_FUTURE_IS_ERR
			) {
			// Sth wrong! the status is crupt so correct it.
				_logErr("The unknown future status : " + __status);
				__status = Future.FLAG_FUTURE_NOT_YET;
			}
			
			return __status;
		}
		/*	Arg:
				<FN|ARR> callbacksForErr = the jobs to do on the OK future; If multiple, put in one array
			Return:
				<OBJ> This future
		*/
		this.next = function (callbacksForOK) {
			if (typeof callbacksForOK == "function" || callbacksForOK instanceof Array) {
				__queueCtrl.push("DEFERRED_QUEUE_FOR_OK", callbacksForOK);
				__flushQueue();
			}
			return this;
		}
		/*	Arg:
				<FN|ARR> callbacksForErr = the jobs to do on the error future; If multiple, put in one array
			Return:
				<OBJ> This future
		*/
		this.fall = function (callbacksForErr) {
			if (typeof callbacksForErr == "function" || callbacksForErr instanceof Array) {
				__queueCtrl.push("DEFERRED_QUEUE_FOR_ERR", callbacksForErr);
				__flushQueue();
			}
			return this;
		}
		/*	Arg:
				<FN> callbackForOK = the job to do on the OK future
				<FN> callbackForErr = the job to do on the error future
			Return:
				<OBJ> one instance of Future::_cls_Future_Swear.
					  However the execution of jobs chained after this method does not depend on this returned swear obj but the returned value by the input callback
		*/
		this.andThen = function (callbackForOK, callbackForErr) {
			/*	Func:
					Mediate the jobs chained after calling this andThen methods to go to which future obj's jobs queue
				Properties:
					[ Private ]
					<OBJ> _predecessorFuture = always this future obj
					<OBJ> _successorFuture = the future obj for the jobs in the andThen future obj's jobs queue 
					<*> _varsForReturnedPredecessor = the vars passed to the jobs in the andThen future obj's jobs queue if returning back to the predecessor
				Methods:
					[ Private ]
					> _callAndThenCallbacks : Run the callbacks passed into the predecessor's andThen method
					[ Public ]
					> leavePredecessor : Leave the execution of jobs in the predecessor's queue first
					> returnToPredecessor : Return to the predecessor's jobs queue
			*/
			var futureHandleMediator = (function (predecessorFuture, callbackForOK, callbackForErr) {
					var _predecessorFuture = predecessorFuture;
					var _successorFuture = null;
					var _varsForReturnedPredecessor;
					/*	Properties:
							[ Public ]
							<*> result = the result returned by this.forOK or this.Err(depending on which one is called).
						Methods:
							[ Public ]
							<FN> forOK, forErr = the callbacks passed into the predecessor's andThen method							
					*/
					var _andThenCallbacks = {
						forOK : callbackForOK,
						forErr : callbackForErr,
						result : undefined
					};
					/*	Arg:
							<STR> predecessorStatus = the predecessor future obj's status
							<ARR> varsForAndThens = the vars passed along the predecessor's queue and would be passed to the and-then callbacks
					*/
					var _callAndThenCallbacks = function (predecessorStatus, varsForAndThens) {
						
						// The successor future obj is going to be determined in the below based on the four cases described above:
						
						// Call the and-then callbacks
						if (   
							   predecessorStatus === Future.FLAG_FUTURE_IS_OK
							&& typeof _andThenCallbacks.forOK == "function"
						) {
							_andThenCallbacks.result = _andThenCallbacks.forOK.apply(null, varsForAndThens);
							
						} else if (
							   predecessorStatus === Future.FLAG_FUTURE_IS_ERR
							&& typeof _andThenCallbacks.forErr == "function"
						) {						
							_andThenCallbacks.result = _andThenCallbacks.forErr.apply(null, varsForAndThens);
						
						} else { // The Case 4:
							_varsForReturnedPredecessor = varsForAndThens;
							_successorFuture = _predecessorFuture;
							return;
						}
						
						// Determine the successor obj
						if (   _andThenCallbacks.result instanceof _cls_Future
							|| _andThenCallbacks.result instanceof _cls_Future_Swear
						) {
						
							if (_andThenCallbacks.result !== _predecessorFuture) { // The Case 1:
							
								_varsForReturnedPredecessor = undefined;
								_successorFuture = _andThenCallbacks.result;
								// Here we put the andThen future obj into the successor's jobs queue
								// so the jobs in the andThen jobs queue can follow the successor's queue
								_successorFuture.next(function () {
									andThenFuture.approve(Array.prototype.slice.call(arguments, 0));
								});
								_successorFuture.fall(function () {
									andThenFuture.disapprove(Array.prototype.slice.call(arguments, 0));
								});
								return;
								
							} else { // The Case 2:
								_varsForReturnedPredecessor = varsForAndThens;
								_successorFuture = _predecessorFuture;
								return;
							}
							
						} else { // The Case 3:
							_varsForReturnedPredecessor = _andThenCallbacks.result;
							_successorFuture = _predecessorFuture;
							return;
						}
					}
				return {
					/*	Arg:
							> predecessorStatus, varsForAndThens = refer to this::_callAndThenCallbacks
					*/
					leavePredecessor : function (predecessorStatus, varsForAndThens) {
						_callAndThenCallbacks(predecessorStatus, varsForAndThens);
					},
					/*	Arg:
							<STR> predecessorStatus = the status of predecessor future obj
					*/
					returnToPredecessor : function (predecessorStatus) {
						// Before returning to the predecessor future, we have to decide the future jobs inside the and-then future obj should follow the predecessor's jobs queue.
						// Next we are going to act based on the type of successor...
						if (_successorFuture === _predecessorFuture) {
						// The successor future obj is the predecessor future.
						// the future jobs inside the and-then future obj shall follow the successor future obj's jobs queue and the execiton depends on the successor's status.
						// So let's settle the and-then future according the predecessor's status.
							if (predecessorStatus === Future.FLAG_FUTURE_IS_OK) {
								andThenFuture.approve(_varsForReturnedPredecessor);
							} else if (predecessorStatus === Future.FLAG_FUTURE_IS_ERR) {
								andThenFuture.disapprove(_varsForReturnedPredecessor);
							}
						} else {
						// The successor is not the predecessor but another future obj,
						// it represents the execution of the jobs future inside the and-then future obj will be taken care of by another future obj.
						// So just do nothing and return to the predecessor future obj and the jobs in the predecessor future obj's queue will run afterwards.
						}
					}
				}
			}(this, callbackForOK, callbackForErr));
			
			// New one future obj for the and-then jobs. This future obj is kind of like an mediator future.
			var andThenFuture = Future.newOne(__name + "::andThen_" + __andThenCount++);
			
			// After the previous job ends, levave the queue first to handle the and-then jobs
			this.next(function () {
				futureHandleMediator.leavePredecessor(Future.FLAG_FUTURE_IS_OK, Array.prototype.slice.call(arguments, 0));
			});
			this.fall(function () {
				futureHandleMediator.leavePredecessor(Future.FLAG_FUTURE_IS_ERR, Array.prototype.slice.call(arguments, 0));
			});
			
			// After the and-then jobs are done, return back to this original future obj
			this.next(function () {
				futureHandleMediator.returnToPredecessor(Future.FLAG_FUTURE_IS_OK);
			});
			this.fall(function () {
				futureHandleMediator.returnToPredecessor(Future.FLAG_FUTURE_IS_ERR);
			});
			
			// Return the and-then future's swear obj so the following jobs will be chained to the and-then future
			return andThenFuture.swear();
		}
		/*	Arg:
				<*|ARR> [settledArgs] = the var to pass along to the future jobs(functions); if multiple, put in one array. Please note that if only one var to pass along, but, that var is an array, please still wrap that var in one array or it woudl be treated as passing in mulitple vars.
			Return:
				Refer to this.report
		*/
		this.approve = function (settledArgs) {
			if (this.report() === Future.FLAG_FUTURE_NOT_YET) {
				var args = (settledArgs instanceof Array) ? settledArgs.slice(0) : [settledArgs];
				__status = Future.FLAG_FUTURE_IS_OK;
				__queueCtrl.setVarsForQueue("DEFERRED_QUEUE_FOR_OK", args);
				__flushQueue();
			}
			return this.report();
		}
		/*	Arg:
				<*|ARR> [settledArgs] = the var to pass along to the future jobs(functions); if multiple, put in one array. Please note that if only one var to pass along, but, that var is an array, please still wrap that var in one array or it woudl be treated as passing in mulitple vars.
			Return:
				Refer to this.report
		*/
		this.disapprove = function (settledArgs) {
			if (this.report() === Future.FLAG_FUTURE_NOT_YET) {
				var args = (settledArgs instanceof Array) ? settledArgs.slice(0) : [settledArgs];
				__status = Future.FLAG_FUTURE_IS_ERR;
				__queueCtrl.setVarsForQueue("DEFERRED_QUEUE_FOR_ERR", args);
				__flushQueue();
			}
			return this.report();
		}
		/*	Return:
				<OBJ> The instance of _cls_Future_Swear assocciated with this future obj
		*/
		this.swear = function () {
			return new _cls_Future_Swear(this);
		}
	}
	/*	Properties: 
			<OBJ> _future = the future obj with which this swear obj associated
		Methods:
			> report : Refer to Private::_future.report
			> next : Refer to Private::_future.next
			> fall : Refer to Private::_future.fall
			> andThen : Refer to Private::_future.andThen
			> swear : Return one swear obj associated with Private::_future
	*/
	function _cls_Future_Swear(future) {
		var _future = future;
		/*	Return: Refer to Future::_cls_Future::report
		*/
		this.report = function () {
			return _future.report();
		}
		/*	Arg:
				> callbacksForOK = Refer to Future::_cls_Future::next
			Return:
				> Refer to this.swear
		*/
		this.next = function (callbacksForOK) {
			_future.next(callbacksForOK);
			return this.swear();
		}
		/*	Arg:
				> callbacksForErr = Refer to Future::_cls_Future::fall
			Return:
				> Refer to this.swear
		*/
		this.fall = function (callbacksForErr) {
			_future.fall(callbacksForErr);
			return this.swear();
		}
		/*	Arg: Return:
				> [callbackForOK], [callbackForErr] = Refer to Future::_cls_Future::andThen
		*/
		this.andThen = function (callbackForOK, callbackForErr) {
			return _future.andThen(callbackForOK, callbackForErr).swear();
		}
		/*	Return: <OBJ> the swear obj itself
		*/
		this.swear = function () {
			return this;
		}
	}
	/*	Properties:
			[ Public ]
			<OBJ> the property name is the future obj's name, the property value is the instance of Future::_cls_Future
	*/
	var _futures = {};
	
	/*	Arg:
			<STR> The error message
	*/
	function _logErr(msg) {
		
		if (typeof Error == "function") {
			try {
				throw new Error;
			} catch (e) {
				
				var stack = "";
				if (typeof e.stack == "string") {
					stack = e.stack.replace("Error", "");
				}
				
				msg += " error " + stack;
			}
		}
		
		if (console.error) {
			console.error(msg);
		} else {
			console.log(msg);
		}
	}
	/*	Arg:
			<OBJ> obj = the object on which the constant property is defined
			<STR> propName = the constant property name
			<*> propValue = the constant property value
			<BOO> [enumerable] = true to make the constant property enumerable on the object
		Return:
			@ OK: <*> The defined value
			@ NG: undefined
	*/
	function _define(obj, propName, propValue, enumerable) {
		
		var defined;
		
		if (obj instanceof Object && propName && typeof propName == "string") {			
			
			if (obj[propName] === undefined) {
		
				try {
					Object.defineProperty(
						obj,
						propName,
						{
							value : propValue,
							writable : false,
							configurable : false,
							enumerable : (enumerable === true)
						}
					);
				} catch (e) {
					obj[propName] = propValue;
				}
			}
			
			defined = obj[propName];
		}
		
		return defined;
	}
	
	var publicProps =  {
			/*	Arg:
					<STR> name = the name of future obj
				Return:
					@ OK: true
					@ NG: false
			*/
			exist : function (name) {
				return _futures[name] instanceof _cls_Future;
			},
			/*	Arg:
					<STR> name = the name of future obj
				Return:
					@ OK: <OBJ> the instance of Future::_cls_Future
					@ NG: null
			*/
			newOne : function (name) {
				var future = null;
				if (typeof name == "string") {
					if (!this.exist(name)) {
						_futures[name] = new _cls_Future(name);
					}
					future = _futures[name];
				}
				return future;
			},
			/*	Arg:
					<STR> name = the name of future obj
				Return:
					@ OK: <OBJ> the deleted instance of Future::_cls_Future
					@ NG: null
			*/
			rmOne : function (name) {
				var future = null;
				if (typeof name == "string") {
					if (_futures[name] instanceof _cls_Future) {
						future = _futures[name];
						delete _futures[name];
					}			
				}
				return future;
			},
			/*	Arg:
					<STR> status = the status of deferred objs to dump, refer to Future::_cls_Future::__status
				Return:
					<ARR> array of names of future objs with the given status
			*/
			dump : function(status) {
				var dumped = [];
				if (   status === Future.FLAG_FUTURE_NOT_YET
					|| status === Future.FLAG_FUTURE_IS_OK
					|| status === Future.FLAG_FUTURE_IS_ERR
				) {
					for (var name in _futures) {
						if (_futures[name] instanceof _cls_Future) {
							if (_futures[name].report() == status) {
								dumped.push(name);
							}
						}
					}
				}
				return dumped;
			}		
		};	
	
	_define(publicProps, "FLAG_FUTURE_NOT_YET", 0, true);
	_define(publicProps, "FLAG_FUTURE_IS_OK", 1, true);
	_define(publicProps, "FLAG_FUTURE_IS_ERR", 2, true);
	
	return publicProps;
}());
