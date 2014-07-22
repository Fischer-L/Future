/*	Func:
		Kind of like the JQuery's Deferreds. But with some extra funtions to track down the status of those deferred tasks, which is convinent for debugging.
	Properties:
		[ Public ]
		<NUM> FLAG_FUTURE_NOT_YET = The flag marking the future is not yet settled
		<NUM> FLAG_FUTURE_IS_OK = The flag marking the future is settled with the OK status
		<NUM> FLAG_FUTURE_IS_ERR = The flag marking the future is settled with the error status
		[ Private ]
		<CLS> _cls_Future_Queue_Ctrl = the controller controlling the jobs queued up to do in the settled future
		<CLS> _cls_Future_During_Ctrl = the controller controlling the jobs to do as the unsettled future would like to inform something
		<CLS> _cls_Future = The so-called Future obj to defer and schedule the future jobs' execution after the prerequisite job ends, kind of like the jQuery's Deferred.
		<CLS> _cls_Future_Swear = The swear from one Future obj. We can use it to make the future obj swear to do sth after the future arrives. The swear obj has no right to settle the future so we can give it to outsiders. Let outsiders access the future obj without the ability to settle/interfere the future, kind of like jQuery's promise obj.
		<OBJ> _futures = the table to storing the future objs
	Methods:
		[ Private ]
		> _logErr : Log error
		> _define : Define constant property on one object
		[ Public ]
		> exist : Check if the specified Future obj is stored and made before.
		> newOne : New one Future obj. Future will also store the generated Future obj. Thus we would be able to call Future.dump to track every Future obj's status and prevent from generating two Future obj for the same thing.
		> rmOne : Remvoe one Future obj from Future's Future pool (Better remove after the future is settled so as to be able to track down unsettled future).
		> dump : Dump the array of names of Future objs. With the method, we could find out Future objs which are settled or not.
*/
var Future = (function () {
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
	
	/*	Properties:
			[ Public ]
			<NUM> FLAG_QUEUE_TYPE_OK = the flag marking the type of queue is for jobs which shall be run in the ok future
			<NUM> FLAG_QUEUE_TYPE_ERR = the flag marking the type of queue is for jobs which shall be run in the error future
			<NUM> FLAG_QUEUE_TYPE_ANYWAY = the flag marking the type of queue is for jobs which shall be run disregarding the ok or error future
			<STR> FLAG_CALLBACK_TYPE_PROP_NAME = the name of property in queued callback which indicates the type of queued callback
			[ Private ]
			<ARR> __queue = the queue of jobs to call when the future is settled. The element inside are callbacks for jobs. Each callback would be added one property which bears the value of this::FLAG_QUEUE_TYPE_* to indicate the type of callback
		Methods:
			[ Public ]
			> setVarsForQueue : Set the vars to be passed into the queued callbacks once they are invoked. Only can set one.
			> push : Add one job(callback) into the queue.
			> flush : Call the queued callbacks in the order they are pushed. After flushing the queue would be empty.
	*/
	function _cls_Future_Queue_Ctrl() {
		/*	Properties:
				[ Public ]
				<ARR> argsForOK = the array of arguments for the jobs queued for ok
				<ARR> argsForERR = the array of arguments for the jobs queued for error
		*/
		var __queue = []; {
			__queue.argsForOK = [];
			__queue.argsForERR = [];
		}		
		/*	Arg:
				<STR> queueType = the queue type. Only accept the type of this::FLAG_QUEUE_TYPE_OK/ERR
				<ARR> vars = the vars to passed to the queued callbacks once they are invoked
			Return:
				@ OK: true
				@ NG: false
		*/
		this.setVarsForQueue = function (queueType, vars) {
			if (vars instanceof Array) {			
				if (queueType == this.FLAG_QUEUE_TYPE_OK && __queue.argsForOK.length <= 0) {	
					__queue.argsForOK = vars.slice(0);
					return true;
				} else if (queueType == this.FLAG_QUEUE_TYPE_ERR && __queue.argsForERR.length <= 0) {	
					__queue.argsForERR = vars.slice(0);
					return true;
				}
			}			
			return false;
		}
		/*	Arg:
				<STR> queueType = the queue type
				<FN|ARR> callbacks = the function to push, if multiple put in one array
			Return:
				<NUM> the numbers of jobs queued (including both for ok and for error)
		*/
		this.push = function (queueType, callbacks) {
			var callback,
				callbacksArray = (callbacks instanceof Array) ? callbacks : [callbacks],
				type = (queueType == this.FLAG_QUEUE_TYPE_OK || queueType == this.FLAG_QUEUE_TYPE_ERR || queueType == this.FLAG_QUEUE_TYPE_ANYWAY) ? queueType : null;
			
			if (type !== null) {
			
				callback = callbacksArray.shift();
				
				while (typeof callback == "function") {
					_define(callback, this.FLAG_CALLBACK_TYPE_PROP_NAME, type, false);
					__queue.push(callback);					
					callback = callbacksArray.shift();					
				}
			}
			
			return __queue.length;
		}
		/*	Arg:
				<STR> queueType = the type of queue to flush. Only accept the type of this::FLAG_QUEUE_TYPE_OK/ERR
		*/
		this.flush = function (queueType) {
			var type = (queueType == this.FLAG_QUEUE_TYPE_OK || queueType == this.FLAG_QUEUE_TYPE_ERR) ? queueType : null;
			
			if (type !== null) {
			
				var callback,
					argsForQueue;
				
				if (type == this.FLAG_QUEUE_TYPE_OK) {
					argsForQueue = __queue.argsForOK;
				} else if (type == this.FLAG_QUEUE_TYPE_ERR) {
					argsForQueue = __queue.argsForERR;
				}
				
				callback = __queue.shift();
				
				while (typeof callback == "function") {					
					if (   callback[this.FLAG_CALLBACK_TYPE_PROP_NAME] == type
						|| callback[this.FLAG_CALLBACK_TYPE_PROP_NAME] == this.FLAG_QUEUE_TYPE_ANYWAY
					) {
						try {
							callback.apply(null, argsForQueue);
						} catch (err) {
							_logErr("" + err);
						}
					}
					callback = __queue.shift();
				}
			}
		}
	}; {
		_define(_cls_Future_Queue_Ctrl.prototype, "FLAG_QUEUE_TYPE_OK", 0, false);
		_define(_cls_Future_Queue_Ctrl.prototype, "FLAG_QUEUE_TYPE_ERR", 1, false);
		_define(_cls_Future_Queue_Ctrl.prototype, "FLAG_QUEUE_TYPE_ANYWAY", 2, false);
		_define(_cls_Future_Queue_Ctrl.prototype, "FLAG_CALLBACK_TYPE_PROP_NAME", "_CALLBACK_TYPE", false);
	}
	/*	Properties:
			[ Private ]
			<ARR> __durings = the jobs(callbacks) to do as the unsettled future would like to inform something
		Methods:
			[ Public ]
			> push : Push one job
			> loop : Loop through and call the callbacks in this::__durings
	*/
	function _cls_Future_During_Ctrl() {
		var __durings = [];
		/*	Arg:
				<FN> callback = the callback to push into this::__durings
			Return:
				<NUM> The number of jobs in this::__durings
		*/
		this.push = function (callback) {
			if (typeof callback == "function") {
				__durings.push(callback);
			}
			return __durings.length;
		}
		/*	Arg:
				<ARR> args = the arguments to pass into the job when invoking each job
		*/
		this.loop = function (args) {
			
			if (args instanceof Array) {
				
				for (var i = 0; i < __durings.length; i++) {
					try {
						__durings[i].apply(null, args);
					} catch (err) {
						_logErr("" + err);
					}
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
			<OBJ> __queueCtrl = the instance of Future::_cls_Future_Queue_Ctrl
			<OBJ> __duringCtrl = the instance of Future::_cls_Future_During_Ctrl
		Methods:
			[ Private ]
			> __flushQueue : Call this::__queueCtrl to flush the corresponding jobs deferred into the future if this future is settled. Do not call this::__queueCtrl directly to flush, instead, use this method to prevent from flushing the job queue while the future is not yet settled.
			[ Public ]
			> getName : Get the name of future
			> report : Report the future obj status
			> next : Add one job and execute the job once the future status is settled with OK, kind of like jQuery's done
			> fall : Add one job and execute the job once the future status is settled with error, kind of like jQuery's fail
			> anyway : Add one job and execute the job anyway no matter that the future is settled with OK or error, kind of like jQuery's always
			> during : Add one job and execute the job during that the future is still ongoing and would like to inform something, kind of like jQuery's progress
			> andThen : Add jobs and execute the jobs once the future status is settled.
						Calling this method gives us a chance to make the jobs after this method chained to another future/swear obj.
						According to the returned value of the called callback, there could be four cases:
						- Case 1: the ok/error and-then callback returns one future or one swear obj different from the original one so the future jobs chained after this andThen call would be tied to this new successor future/swear obj and the arguments for jobs in the successor's queue would depend on the successor's arguments settled with.
						- Case 2: the and-then callback returns the original future obj so the successor would be the original one still and the arguments for jobs in the successor's queue would be arguments passed along the original one's queue.
						- Case 3: the and-then callbacks returns one array of arguments but future obj so the successor would be the original one still and that returned array would be the arguments for jobs in the successor's queue.
						- Case 4: No and-then callbacks could be called so the successor would be the original one still and the arguments for jobs in the successor's queue would be arguments passed along the original one's queue.
						- Case 5: The during and-then callbacks have been called and return other future/swear obj. In this case, the jobs chained after the andThen method have multiple future to chose so the race among futures begins.
						          The following chained jobs will be invoked in the future which is settled first.
								  For example, two during callbacks generates two futures, the ok callback keeps the original future and the error callback generates another new future.
								  If one of the futures from the during callbacks is settled first, the chained jobs are invoked in this future.
								  Or if the ok callback is called first, the chained jobs are invoked in the original future.
								  Or if the error callback is called first, the chained jobs are invoked in the first-settled one among the remaining three futures (two from the during callbacks, one from the error callback).
						This method is kind of like jQuery's then.
			> inform : Inform the future's progress. Calling this method will invoke the during callbacks in the order they were added. The during callbacks won't be cleared after invoked so they are able to receive the next notification. No effect as the future is settled, kind of like jQuery's notify. Unlike jQuery's notify, however, the during callback added later is unable to receive the notification informed before, which is possible in jQuery's notify.
			> approve : Approve the future. Calling this method will invoke the callbacks for the ok future in the order they were added. The callbacks are cleared after invoked. This is to settle the future with the OK status, kind of like jQuery's resolve
			> disapprove : Disapprove the future. Calling this method will invoke the callbacks for the error future in the order they were added. The callbacks are cleared after invoked. This is to settle the future with the Error status, kind of like jQuery's reject
			> swear : Get the swear obj assocciated with this future obj, kind of like jQuery's promise
	------------------------------------------------------------------------------------------------
		Arg:
			<STR> name = the name of the future obj
	*/
	function _cls_Future(name) {
		var __name = name,
			__swear = null,
			__andThenCount = 0,
			__status = Future.FLAG_FUTURE_NOT_YET,
			__queueCtrl = new _cls_Future_Queue_Ctrl,
			__duringCtrl = new _cls_Future_During_Ctrl;
		/*
		*/
		function __flushQueue() {
			if (Future.FLAG_FUTURE_IS_OK === __status) {			
				__queueCtrl.flush(__queueCtrl.FLAG_QUEUE_TYPE_OK);				
			} else if (Future.FLAG_FUTURE_IS_ERR === __status) {			
				__queueCtrl.flush(__queueCtrl.FLAG_QUEUE_TYPE_ERR);
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
				<FN|ARR> callbacks = the jobs to do in the OK future; If multiple, put in one array
			Return:
				<OBJ> This future
		*/
		this.next = function (callbacks) {
			if (typeof callbacks == "function" || callbacks instanceof Array) {
				__queueCtrl.push(__queueCtrl.FLAG_QUEUE_TYPE_OK, callbacks);
				__flushQueue();
			}
			return this;
		}
		/*	Arg:
				<FN|ARR> callbacks = the jobs to do in the error future; If multiple, put in one array
			Return:
				<OBJ> This future
		*/
		this.fall = function (callbacks) {
			if (typeof callbacks == "function" || callbacks instanceof Array) {
				__queueCtrl.push(__queueCtrl.FLAG_QUEUE_TYPE_ERR, callbacks);
				__flushQueue();
			}
			return this;
		}
		/*	Arg:
				<FN|ARR> callbacks = the job to do in the future; If multiple, put in one array
			Return:
				<OBJ> This future
		*/
		this.anyway = function (callbacks) {
			if (typeof callbacks == "function" || callbacks instanceof Array) {
				__queueCtrl.push(__queueCtrl.FLAG_QUEUE_TYPE_ANYWAY, callbacks);
				__flushQueue();
			}
			return this;
		}		
		/*	Arg:
				<FN|ARR> callbacks = the job to add; If multiple, put in one array
			Return:
				<OBJ> This future
		*/
		this.during = function (callbacks) {
			var fns = (callbacks instanceof Array) ? callbacks : [callbacks];
			for (var i = 0; i < fns.length; i++) {
				__duringCtrl.push(fns[i]);
			}
			return this;
		}
		/*	Arg: 
				<FN> [okCallback] = the job to do in the OK future
				<FN> [errCallback] = the job to do in the error future
				<FN> [duringCallback] = the job to receive the notification from future
			Return:
				<OBJ> one instance of Future::_cls_Future_Swear.
					  However the execution of jobs chained after this method does not depend on this returned swear obj but the returned value by the input callback
		*/
		this.andThen = function (okCallback, errCallback, duringCallback) {
			
			// New one future obj for the and-then jobs. This future obj is kind of like an mediator future.
			var andThenFuture = Future.newOne(__name + "::andThen_" + __andThenCount++);
			
			/*	Func:
					Mediate the jobs chained after calling this andThen methods to go to which future obj's jobs queue
				Properties:
					[ Private ]
					<OBJ> andThenFuture = The instance of _cls_Future which its _cls_Future_Swear obj will be returned outside.
					<OBJ> originalFuture = The current instance of _cls_Future
					<OBJ> originalSwear = The current instance of _cls_Future_Swear of the current instance of _cls_Future
					<FN> okCallback, errCallback, duringCallback = The callbacks passed into this andThen method
					<OBJ> newFuturePool = The pool managing the future/swear objs returned by calling this::okCallback/errCallback/duringCallback
				Methods:
					[ Private ]
					> chainAndThenFutureOn : Chain the future jobs after this and-then onto the future/swear obj decided by the calling of callbacks
					[ Public ]
					> callAndThenCallback : Call the callbacks passed into the andThen method
			*/
			var futureMediator = (function (andThenFuture, originalFuture, originalSwear, okCallback, errCallback, duringCallback) {
					
					/*	Properties:
							[ Private ]
							<ARR> __addeds = The added the future/swear objs
						Methods:
							[ Public ]
							> add : Add one future/swear obj if not in this::__addeds
							> exist : Check the existence of one future/swear obj
					*/
					var newFuturePool = (function () {
					
							var __addeds = [];
							
						return {
							/*	Arg:
									<OBJ> f = One future/swear obj
								Return:
									@ OK: true
									@ NG: false
							*/
							add : function (f) {									
								if (   (f instanceof _cls_Future || f instanceof _cls_Future_Swear)
									&& !this.exist(f)
								) {
									__addeds.push(f);
									return true;
								}
								return false;
							},
							/*	Arg:
									<OBJ> f = One future/swear obj
								Return:
									@ In this::__addeds: true
									@ Not in this::__addeds: false
							*/
							exist : function (f) {
								for (var i = 0; i < __addeds.length; i++) {
									if (__addeds[i] === f) {
										return true;
									}
								}
								return false;
							}
					}}());
					
					/*	Properties:
							[ Public ]
							<BOO> [useNewArgs] = true means taking this::newArgs as the arguments, otherwise, taking the default arguments
							<*|ARR> [newArgs] = The new arguments to pass into the following jobs
						--------------------------------------
						Arg:
							<OBJ> baseFuture = The base future onto which the and-then future is chained; could be one future/swear obj
							<STR> cmd = the command to chain
					*/
					function chainAndThenFutureOn(baseFuture, cmd) {
					
						if (andThenFuture.report() === Future.FLAG_FUTURE_NOT_YET) {
							
							switch (cmd) {
							
								case "approve":
									baseFuture.next(function () {
										var args = chainAndThenFutureOn.useNewArgs ? chainAndThenFutureOn.newArgs : Array.prototype.slice.call(arguments, 0);
										andThenFuture.approve(args);
									});
								return;
							
								case "disapprove": 
									baseFuture.fall(function () {
										var args = chainAndThenFutureOn.useNewArgs ? chainAndThenFutureOn.newArgs : Array.prototype.slice.call(arguments, 0);
										andThenFuture.disapprove(args);
									});
								return;
								
								case "inform":
									baseFuture.during(function () {
										var args = chainAndThenFutureOn.useNewArgs ? chainAndThenFutureOn.newArgs : Array.prototype.slice.call(arguments, 0);
										andThenFuture.inform(args);									
									});
								return;
							}
						}
					}
					chainAndThenFutureOn.newArgs = [];
					chainAndThenFutureOn.useNewArgs = false;
										
				return {
					/*	Arg:
							<STR> predecessorStatus = the predecessor future obj's status
							<ARR> varsForAndThen = the vars passed along the predecessor's queue and would be passed to the and-then callbacks
					*/
					callAndThenCallback : function (predecessorStatus, varsForAndThen) {
						
						var newFuture,
							callType,
							callResultCase,							
							callResultValue,
							callbacks = {
								okCallback : okCallback,
								errCallback : errCallback,
								duringCallback : duringCallback
							};
						
						switch (predecessorStatus) {
							case Future.FLAG_FUTURE_IS_OK:
								callType = "okCallback";
							break;
							
							case Future.FLAG_FUTURE_IS_ERR:
								callType = "errCallback";
							break;
							
							case Future.FLAG_FUTURE_NOT_YET:
								callType = "duringCallback";
							break;
						}
													
						
						// Let's call the desired callback to
						// decide the future onto which the future jobs after this and-then are chained
						// and decide the arguments passed into the future jobs 
						
						chainAndThenFutureOn.newArgs = [];
						chainAndThenFutureOn.useNewArgs = false;
						
						if (typeof callbacks[callType] == "function") {
						
							callResultValue = callbacks[callType].apply(null, varsForAndThen);		

							if (callResultValue instanceof _cls_Future || callResultValue instanceof _cls_Future_Swear) {
							
								newFuture = (callResultValue === originalFuture || callResultValue === originalSwear) ? originalFuture : callResultValue;
								
							} else {
							
								newFuture = originalFuture;
								chainAndThenFutureOn.newArgs = callResultValue;
								chainAndThenFutureOn.useNewArgs = true;
							}
							
						} else {
						
							newFuture = originalFuture;
						}						
						
						if (newFuturePool.add(newFuture)) { // We don't want to double chain onto the one chained before
							
							// Let's chain the future jobs after this and-then onto the future/swear obj decided by the calling of callbacks 
							switch (predecessorStatus) {
								case Future.FLAG_FUTURE_IS_OK:
									chainAndThenFutureOn(newFuture, "approve");
								break;
								
								case Future.FLAG_FUTURE_IS_ERR:
									chainAndThenFutureOn(newFuture, "disapprove");
								break;
								
								case Future.FLAG_FUTURE_NOT_YET:
									chainAndThenFutureOn(newFuture, "approve");
									chainAndThenFutureOn(newFuture, "disapprove");
									chainAndThenFutureOn(newFuture, "inform");
								break;
							}
						}
					}
				}
			}(andThenFuture, this, __swear, okCallback, errCallback, duringCallback));
			
			this.next(function () {
					futureMediator.callAndThenCallback(Future.FLAG_FUTURE_IS_OK, Array.prototype.slice.call(arguments, 0));
				})
				.fall(function () {
					futureMediator.callAndThenCallback(Future.FLAG_FUTURE_IS_ERR, Array.prototype.slice.call(arguments, 0));
				})
				.during(function () {
					futureMediator.callAndThenCallback(Future.FLAG_FUTURE_NOT_YET, Array.prototype.slice.call(arguments, 0));
				});
			
			// Return the and-then future's swear obj so the following jobs will be chained to the and-then future
			return andThenFuture.swear();
		}
		/*	Arg:
				<*|ARR> [msgArgs] = the messages being informed; the arguments to pass into the during callbacks; if multiple, put in one array. Please note that if only one var to pass along, but, that var is an array, please still wrap that var in one array or it woudl be treated as passing in mulitple vars.
			Return:
				Refer to this.report
		*/
		this.inform = function (msgArgs) {
			if (this.report() === Future.FLAG_FUTURE_NOT_YET) {
				var args = (msgArgs instanceof Array) ? msgArgs.slice(0) : (msgArgs !== undefined) ? [msgArgs] : [];
				__duringCtrl.loop(args);
			}
		}
		/*	Arg:
				<*|ARR> [settledArgs] = the var to pass along to the future jobs(functions); if multiple, put in one array. Please note that if only one var to pass along, but, that var is an array, please still wrap that var in one array or it woudl be treated as passing in mulitple vars.
			Return:
				Refer to this.report
		*/
		this.approve = function (settledArgs) {
			if (this.report() === Future.FLAG_FUTURE_NOT_YET) {
				var args = (settledArgs instanceof Array) ? settledArgs.slice(0) : (settledArgs !== undefined) ? [settledArgs] : [];
				__status = Future.FLAG_FUTURE_IS_OK;
				__queueCtrl.setVarsForQueue(__queueCtrl.FLAG_QUEUE_TYPE_OK, args);
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
				var args = (settledArgs instanceof Array) ? settledArgs.slice(0) : (settledArgs !== undefined) ? [settledArgs] : [];
				__status = Future.FLAG_FUTURE_IS_ERR;
				__queueCtrl.setVarsForQueue(__queueCtrl.FLAG_QUEUE_TYPE_ERR, args);
				__flushQueue();
			}
			return this.report();
		}
		/*	Return:
				<OBJ> The instance of _cls_Future_Swear assocciated with this future obj
		*/
		this.swear = function () {
			if (!(__swear instanceof _cls_Future_Swear)) {
				__swear = new _cls_Future_Swear(this);
			}
			return __swear;
		}
	}
	/*	Properties: 
			<OBJ> _future = the future obj with which this swear obj associated
		Methods:
			> report : Refer to this::_future.report
			> next : Refer to this::_future.next
			> fall : Refer to this::_future.fall
			> anyway : Refer to this::_future.anyway
			> during : Refer to this::_future.during
			> andThen : Refer to this::_future.andThen
			> swear : Return one swear obj associated with this::_future
	*/
	function _cls_Future_Swear(future) {
		var _future = future;
		/*	Return: Refer to Future::_cls_Future::report
		*/
		this.report = function () {
			return _future.report();
		}
		/*	Arg:
				> callbacks = Refer to Future::_cls_Future::next
			Return:
				> Refer to this.swear
		*/
		this.next = function (callbacks) {
			_future.next(callbacks);
			return this.swear();
		}
		/*	Arg:
				> callbacks = Refer to Future::_cls_Future::fall
			Return:
				> Refer to this.swear
		*/
		this.fall = function (callbacks) {
			_future.fall(callbacks);
			return this.swear();
		}
		/*	Arg:
				> callbacks = Refer to Future::_cls_Future::anyway
			Return:
				> Refer to this.swear
		*/
		this.anyway = function (callbacks) {
			_future.anyway(callbacks);
			return this.swear();
		}
		/*	Arg:
				> callbacks = Refer to Future::_cls_Future::during
			Return:
				> Refer to this.swear
		*/
		this.during = function (callbacks) {
			_future.during(callbacks);
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
